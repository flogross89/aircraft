﻿import { ComponentProps, DisplayComponent, FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';
import './style.scss';

interface ButtonProps extends ComponentProps {
    disabled?: Subscribable<boolean>;
    containerStyle?: string;
    onClick: () => void;
}
export class Button extends DisplayComponent<ButtonProps> {
    private spanRef = FSComponent.createRef<HTMLSpanElement>();

    onAfterRender(node: VNode): void {
        super.onAfterRender(node);

        if (this.props.disabled === undefined || this.props.disabled.get() === false) {
            this.spanRef.instance.addEventListener('click', () => this.props.onClick());
        }
    }

    render(): VNode {
        return (
            <span
                ref={this.spanRef}
                class={`MFDButton${(this.props.disabled !== undefined && this.props.disabled.get() === true) ? ' disabled' : ''}`}
                style={`align-items: center; ${(this.props.disabled !== undefined && this.props.disabled.get() === true) ? 'color: grey; ' : ''} ${this.props.containerStyle}`}
            >
                {this.props.children}
            </span>
        );
    }
}