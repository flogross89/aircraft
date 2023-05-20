﻿import { ComponentProps, DisplayComponent, FSComponent, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import './style.scss';

type PageSelectorMenuItem = {
    label: string;
    action(): void;
};

interface PageSelectorDropdownMenuProps extends ComponentProps {
    label: string;
    menuItems: PageSelectorMenuItem[];
    isActive: Subscribable<boolean>;
    idPrefix: string;
    containerStyle?: string;
}
export class PageSelectorDropdownMenu extends DisplayComponent<PageSelectorDropdownMenuProps> {
    private dropdownSelectorRef = FSComponent.createRef<HTMLDivElement>();

    private dropdownSelectorLabelRef = FSComponent.createRef<HTMLSpanElement>();

    private dropdownMenuRef = FSComponent.createRef<HTMLDivElement>();

    private dropdownIsOpened = Subject.create(false);

    onAfterRender(node: VNode): void {
        super.onAfterRender(node);

        this.props.menuItems.forEach((val, i) => {
            document.getElementById(`${this.props.idPrefix}_${i}`).addEventListener('click', () => {
                val.action();
                this.dropdownIsOpened.set(false);
            });
        });

        this.dropdownSelectorRef.instance.addEventListener('click', () => {
            this.dropdownIsOpened.set(!this.dropdownIsOpened.get());
        });

        this.dropdownIsOpened.sub((val) => {
            this.dropdownMenuRef.instance.style.display = val ? 'block' : 'none';
            this.dropdownSelectorLabelRef.instance.classList.toggle('opened');
        });

        this.props.isActive.sub((val) => {
            if (val === true) {
                this.dropdownSelectorLabelRef.instance.classList.add('active');
            } else {
                this.dropdownSelectorLabelRef.instance.classList.remove('active');
            }
        }, true);
    }

    render(): VNode {
        return (
            <div class="MFDDropdownContainer" style={this.props.containerStyle}>
                <div class="MFDPageSelectorOuter" ref={this.dropdownSelectorRef}>
                    <div style="display: flex; flex: 8; justify-content: center; hover:background-color: cyan;">
                        <span class="MFDPageSelectorLabel" ref={this.dropdownSelectorLabelRef}>
                            {this.props.label}
                        </span>
                    </div>
                    <div style="display: flex;">
                        <span style="padding: 8px;">
                            <svg height="15" width="15">
                                <polygon points="0,0 15,0 7.5,15" style="fill: white" />
                            </svg>
                        </span>
                    </div>
                </div>
                <div ref={this.dropdownMenuRef} class="MFDDropdownMenu" style={`display: ${this.dropdownIsOpened.get() ? 'block' : 'none'}`}>
                    {this.props.menuItems.map((el, idx) => (
                        <span
                            id={`${this.props.idPrefix}_${idx}`}
                            class="MFDDropdownMenuElement"
                            style={'text-align: \'left\'; padding: 5px 16px;'}
                        >
                            {el.label}
                        </span>
                    ), this)}
                </div>
            </div>
        );
    }
}