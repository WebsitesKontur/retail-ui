import * as React from "react";

export = RetailUI;

declare namespace RetailUI {
    interface IconProps {
        color?: string;
        name: Array<string>;
        size: number | string;
    }

    interface IconState{
    }

    class Icon extends React.Component<IconProps, IconState> {
    }
}
