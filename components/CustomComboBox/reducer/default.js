// @flow
/* global $Subtype */
import React from 'react';
import debounce from 'lodash.debounce';

import MenuItem from '../../MenuItem';
import type Menu from '../../Menu/Menu';
import type CustomComboBox from '../CustomComboBox';

type Action = $Subtype<{ type: string }>;

type Props = {
  itemToValue: (any) => string,
  onBlur?: () => {},
  onChange?: () => {},
  onFocus?: () => {},
  onInputChange?: (textValue: string) => any,
  onSearchRequest: (query: string) => Promise<any[]>,
  onUnexpectedInput?: (query: string) => ?boolean,
  value?: any,
  valueToString: (any) => string
};

type State = {
  editing: boolean,
  inputChanged: boolean,
  items: ?Array<any>,
  loading: boolean,
  opened: boolean,
  textValue: string
};

type Reducer = (state: State, props: Props, action: Action) =>
  | State
  | [State, Function[]];

const defaultState = {
  editing: false,
  inputChanged: false,
  items: null,
  loading: false,
  opened: false,
  textValue: ''
};

type EffectType = (
  dispatch: (action: Action) => any,
  getState: () => State,
  getProps: () => Props,
  getInstance: () => CustomComboBox
) => any;

let requestId = 0;
const searchFactory = (isEmpty: boolean): EffectType =>
  (dispatch, getState, getProps) => {
    async function makeRequest() {
      dispatch({ type: 'RequestItems' });
      const { onSearchRequest } = getProps();
      const searchValue = isEmpty ? '' : getState().textValue;
      let expectingId = ++requestId;

      try {
        const items = await onSearchRequest(searchValue);
        if (expectingId === requestId) {
          dispatch({ type: 'ReceiveItems', items });
        }
      } catch (e) {
        if (expectingId === requestId) {
          dispatch({ type: 'RequestFailure', repeatRequest: makeRequest });
        }
      }
    }
    makeRequest();
  };

const Effect = {
  Search: searchFactory,
  DebouncedSearch: debounce(searchFactory(false), 300),
  Blur: ((dispatch, getState, getProps) => {
    const { onBlur } = getProps();
    onBlur && onBlur();
  }: EffectType),
  Focus: ((dispatch, getState, getProps) => {
    const { onFocus } = getProps();
    onFocus && onFocus();
  }: EffectType),
  Change: (value: any): EffectType =>
    (dispatch, getState, getProps) => {
      const { onChange } = getProps();
      onChange && onChange({ target: { value } }, value);
    },
  UnexpectedInput: (textValue: string): EffectType =>
    (dispatch, getState, getProps) => {
      const { onUnexpectedInput } = getProps();
      onUnexpectedInput && onUnexpectedInput(textValue);
    },
  InputChange: ((dispatch, getState, getProps) => {
    const { onInputChange } = getProps();
    const { textValue } = getState();
    if (onInputChange) {
      const returnedValue = onInputChange(textValue);
      if (typeof returnedValue === 'string' && returnedValue !== textValue) {
        dispatch({ type: 'TextChange', value: returnedValue });
      }
    }
  }: EffectType),
  HighlightMenuItem: ((dispatch, getState, getProps, getInstance) => {
    const { value, itemToValue } = getProps();
    const { items } = getState();
    const { menu }: { menu: Menu } = getInstance();

    if (!menu) {
      return;
    }

    let index = -1;
    if (items && items.length && value) {
      index = items.findIndex(x => itemToValue(x) === itemToValue(value));
    }
    menu._highlightItem(index);
    if (index >= 0) {
      process.nextTick(() => menu && menu._scrollToSelected());
    } else {
      process.nextTick(() => menu && menu.down());
    }
  }: EffectType),
  SelectMenuItem: ((dispatch, getState, getProps, getInstance) => {
    const { menu }: { menu: Menu } = getInstance();
    menu && menu.enter();
  }: EffectType),
  MoveMenuHighlight: (direction: 1 | -1): EffectType =>
    (dispatch, getState, getProps, getInstance) => {
      const { menu }: { menu: Menu } = getInstance();
      menu && menu._move(direction);
    }
};

const reducers: { [type: string]: Reducer } = {
  Mount: () => defaultState,
  DidUpdate(state, props, action) {
    if (props.value === action.prevProps.value) {
      return state;
    }
    return {
      ...state,
      opened: false,
      editing: false
    };
  },
  Blur(state, props, action) {
    const { items, inputChanged } = state;
    const nextState = {
      ...state,
      opened: false,
      items: null
    };
    if (!inputChanged) {
      return [
        {
          ...nextState,
          editing: false
        },
        [Effect.Blur]
      ];
    }

    if (items && items.length === 1) {
      return [
        {
          ...nextState,
          editing: false
        },
        [Effect.Blur, Effect.Change(items[0])]
      ];
    }

    return [nextState, [Effect.Blur, Effect.UnexpectedInput(state.textValue)]];
  },
  Focus(state, props, action) {
    if (state.editing) {
      return [
        {
          ...state,
          opened: true
        },
        [Effect.Search(false), Effect.Focus]
      ];
    }

    const textValue = props.value ? props.valueToString(props.value) : '';
    return [
      {
        ...state,
        opened: true,
        editing: true,
        textValue
      },
      [Effect.Search(true), Effect.Focus]
    ];
  },
  TextChange(state, props, action) {
    return [
      {
        ...state,
        inputChanged: true,
        textValue: action.value
      },
      [Effect.DebouncedSearch, Effect.InputChange]
    ];
  },
  ValueChange(state, props, action) {
    return [
      {
        ...state,
        opened: false,
        inputChanged: false,
        editing: false
      },
      [Effect.Change(action.value)]
    ];
  },
  KeyPress(state, props, { event }) {
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        return [state, [Effect.SelectMenuItem]];
      case 'ArrowUp':
      case 'ArrowDown':
        event.preventDefault();
        const effects = [
          Effect.MoveMenuHighlight(event.key === 'ArrowUp' ? -1 : 1)
        ];
        if (!state.opened) {
          effects.push(Effect.Search(false));
        }
        return [
          {
            ...state,
            opened: true
          },
          effects
        ];
      case 'Escape':
        return {
          ...state,
          items: null,
          opened: false
        };
      default:
        return state;
    }
  },
  RequestItems(state, props, action) {
    return {
      ...state,
      loading: true
    };
  },
  ReceiveItems(state, props, action) {
    return [
      {
        ...state,
        loading: false,
        items: action.items
      },
      [Effect.HighlightMenuItem]
    ];
  },
  RequestFailure(state, props, action) {
    return [
      {
        ...state,
        items: [
          <MenuItem disabled>
            <div style={{ maxWidth: 300, whiteSpace: 'normal' }}>
              Что-то пошло не так. Проверьте соединение{' '}
              с интернетом и попробуйте еще раз
            </div>
          </MenuItem>,
          <MenuItem alkoLink onClick={action.repeatRequest}>
            Обновить
          </MenuItem>
        ]
      },
      [Effect.HighlightMenuItem]
    ];
  }
};

export { reducers, defaultState, Effect };