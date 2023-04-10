﻿import { DisplayComponent, FSComponent, Subscribable, VNode } from 'msfssdk';
import './common.scss';

interface ActivePageTitleBarProps {
    activePage: Subscribable<string>;
    tmpyIsActive: Subscribable<boolean>;
}
export class ActivePageTitleBar extends DisplayComponent<ActivePageTitleBarProps> {
    render(): VNode {
        return (
            <div style="display: flex;">
                <div style="flex: 10; background-color: #a0a0a0;">
                    <span class="MFDLabel" style="color: #222222; margin-left: 7px; font-size: 26px;">{this.props.activePage}</span>
                </div>
                <div style="width: 60px; background-color: #a0a0a0; margin-left: 2px;" />
                <div style="width: 80px; background-color: #a0a0a0; margin-left: 2px; display: flex; justify-content: center;">
                    {(this.props.tmpyIsActive.get() === true) && <span class="MFDLabel" style="background-color: yellow; color: #222222; font-size: 26px;">TMPY</span>}
                </div>
            </div>
        );
    }
}