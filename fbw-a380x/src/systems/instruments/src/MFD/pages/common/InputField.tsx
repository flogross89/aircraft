import { ComponentProps, DisplayComponent, FSComponent, Subject, Subscribable, SubscribableUtils, Subscription, VNode } from '@microsoft/msfs-sdk';
import './style.scss';
import { DataEntryFormat } from 'instruments/src/MFD/pages/common/DataEntryFormats';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';

// eslint-disable-next-line max-len
export const emptyMandatoryCharacter = (selected: boolean) => `<svg width="16" height="23" viewBox="1 1 13 23"><polyline points="2,2 2,22 13,22 13,2 2,2" fill="none" stroke=${selected ? 'black' : '#e68000'} stroke-width="2" /></svg>`;

interface InputFieldProps<T> extends ComponentProps {
    dataEntryFormat: DataEntryFormat<T>;
    mandatory?: Subscribable<boolean>; // Renders empty values with orange rectangles
    inactive?: Subscribable<boolean>; // If inactive, will be rendered as static value (green text)
    disabled?: Subscribable<boolean>; // Whether value can be set (if disabled, rendered as input field but greyed out)
    canBeCleared?: Subscribable<boolean>;
    enteredByPilot?: Subscribable<boolean>; // Value will be displayed in smaller font, if not entered by pilot (i.e. computed)
    canOverflow?: boolean;
    value: Subject<T | null> | Subscribable<T | null>;
    /**
     * If defined, this component does not update the value prop, but rather calls this method.
     */
    onModified?: (newValue: T | null) => void;
    onInput?: (newValue: string) => void; // Called for every character that is being typed
    /**
     * Function which modifies data within flight plan. Called during validation phase, after data entry format has been checked
     * @param newValue to be validated
     * @returns whether validation was successful. If nothing is returned, success is assumed
     */
    dataHandlerDuringValidation?: (newValue: T | null, oldValue?: T | null) => Promise<boolean | void>;
    errorHandler?: (errorType: FmsErrorType) => void;
    handleFocusBlurExternally?: boolean;
    containerStyle?: string;
    alignText?: 'flex-start' | 'center' | 'flex-end' | Subscribable<'flex-start' | 'center' | 'flex-end'>;
    tmpyActive?: Subscribable<boolean>;
    // inViewEvent?: Consumer<boolean>; // Consider activating when we have a larger collision mesh for the screens
}

/**
 * Input field for text or numbers
 */
export class InputField<T> extends DisplayComponent<InputFieldProps<T>> {
    // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
    private subs = [] as Subscription[];

    public topRef = FSComponent.createRef<HTMLDivElement>();

    public containerRef = FSComponent.createRef<HTMLDivElement>();

    private spanningDivRef = FSComponent.createRef<HTMLDivElement>();

    public textInputRef = FSComponent.createRef<HTMLSpanElement>();

    private caretRef = FSComponent.createRef<HTMLSpanElement>();

    private leadingUnit = Subject.create<string>('');

    private trailingUnit = Subject.create<string>('');

    private leadingUnitRef = FSComponent.createRef<HTMLSpanElement>();

    private trailingUnitRef = FSComponent.createRef<HTMLSpanElement>();

    private modifiedFieldValue = Subject.create<string | null>(null);

    private isFocused = Subject.create(false);

    private isValidating = Subject.create(false);

    private alignTextSub: Subscribable<'flex-start' | 'center' | 'flex-end'> = SubscribableUtils.toSubscribable(this.props.alignText ?? 'center', true);

    private onNewValue() {
        // Don't update if field is being edited
        if (this.isFocused.get() === true || this.isValidating.get() === true) {
            return;
        }

        // Reset modifiedFieldValue
        if (this.modifiedFieldValue.get() !== null) {
            this.modifiedFieldValue.set(null);
        }
        if (this.props.value.get() !== undefined) {
            if (this.props.canOverflow === true) {
                // If item was overflowed, check whether overflow is still needed
                this.overflow(!((this.props.value.get()?.toString().length ?? 0) <= this.props.dataEntryFormat.maxDigits));
            }

            if (this.props.mandatory?.get() === true) {
                this.textInputRef.getOrDefault()?.classList.remove('mandatory');
            }
        }
        this.updateDisplayElement();
    }

    private updateDisplayElement() {
        // If input was not modified, render props' value
        if (this.modifiedFieldValue.get() === null) {
            if (this.props.value.get() === null || this.props.value.get() === undefined) {
                this.populatePlaceholders();
            } else {
                const [formatted, leadingUnit, trailingUnit] = this.props.dataEntryFormat.format(this.props.value.get());
                this.textInputRef.instance.innerText = formatted ?? '';
                this.leadingUnit.set(leadingUnit ?? '');
                this.trailingUnit.set(trailingUnit ?? '');
            }
        } else { // Else, render modifiedFieldValue
            const numDigits = this.props.dataEntryFormat.maxDigits;
            if ((this.modifiedFieldValue.get()?.length ?? 0) < numDigits || this.isFocused.get() === false || this.props.canOverflow === true) {
                this.textInputRef.instance.innerText = this.modifiedFieldValue.get() ?? '';
                this.caretRef.instance.innerText = '';
            } else {
                this.textInputRef.instance.innerText = this.modifiedFieldValue.get()?.slice(0, numDigits - 1) ?? '';
                this.caretRef.instance.innerText = this.modifiedFieldValue.get()?.slice(numDigits - 1, numDigits) ?? '';
            }
        }
    }

    // Called when the input field changes
    private onInput() {
        if (this.props.canOverflow === true && this.modifiedFieldValue.get()?.length === this.props.dataEntryFormat.maxDigits) {
            this.overflow(true);
        }

        if (this.props.onInput) {
            this.props.onInput(this.modifiedFieldValue.get() ?? '');
        }
    }

    public overflow(overflow: boolean) {
        if (this.topRef.getOrDefault() && this.containerRef.getOrDefault()) {
            if (overflow === true) {
                this.topRef.instance.style.position = 'relative';
                this.topRef.instance.style.top = '0px';
                this.containerRef.instance.style.position = 'absolute';
                this.containerRef.instance.style.top = '-18px';
                this.containerRef.instance.style.zIndex = '5';
                const remainingWidth = 768 - 50 - this.containerRef.instance.getBoundingClientRect().left;
                this.containerRef.instance.style.width = `${remainingWidth}px`; // TODO extend to right edge
                this.containerRef.instance.style.border = '1px solid grey';
            } else {
                this.topRef.instance.style.position = '';
                this.topRef.instance.style.top = '';
                this.containerRef.instance.style.position = '';
                this.containerRef.instance.style.top = '';
                this.containerRef.instance.style.zIndex = '';
                this.containerRef.instance.style.width = '';
                this.containerRef.instance.style.border = '';

                if (this.props.containerStyle) {
                    this.containerRef.instance.setAttribute('style', this.props.containerStyle);
                }
            }
        }
    }

    private onKeyDown(ev: KeyboardEvent) {
        if (ev.keyCode === KeyCode.KEY_BACK_SPACE) {
            if (this.modifiedFieldValue.get() === null && this.props.canBeCleared?.get() === true) {
                this.modifiedFieldValue.set('');
            } else if (this.modifiedFieldValue.get()?.length === 0) {
                // Do nothing
            } else {
                this.modifiedFieldValue.set(this.modifiedFieldValue.get()?.slice(0, -1) ?? '');
            }

            this.onInput();
        }
    }

    private onKeyPress(ev: KeyboardEvent) {
        // Un-select the text
        this.textInputRef.instance.classList.remove('valueSelected');
        // ev.key is undefined, so we have to use the deprecated keyCode here
        const key = String.fromCharCode(ev.keyCode).toUpperCase();

        if (ev.keyCode !== KeyCode.KEY_ENTER) {
            if (this.modifiedFieldValue.get() === null) {
                this.modifiedFieldValue.set('');
                this.spanningDivRef.instance.style.justifyContent = 'flex-start';
            }

            if ((this.modifiedFieldValue.get()?.length ?? 0) < this.props.dataEntryFormat.maxDigits || this.props.canOverflow === true) {
                this.modifiedFieldValue.set(`${this.modifiedFieldValue.get()}${key}`);
                this.caretRef.instance.style.display = 'inline';
            }

            this.onInput();
        } else {
            // Enter was pressed
            ev.preventDefault();

            if (this.props.handleFocusBlurExternally === true) {
                this.onBlur(true);
            } else {
                this.textInputRef.instance.blur();
            }
        }
    }

    public onFocus() {
        if (this.isFocused.get() === false && this.isValidating.get() === false && this.props.disabled?.get() === false && this.props.inactive?.get() === false) {
            this.isFocused.set(true);
            Coherent.trigger('FOCUS_INPUT_FIELD');
            this.textInputRef.instance.classList.add('valueSelected');
            this.textInputRef.instance.classList.add('editing');
            if (this.props.mandatory?.get() === true) {
                this.textInputRef.instance.classList.remove('mandatory');
            }
            this.modifiedFieldValue.set(null);
            this.spanningDivRef.instance.style.justifyContent = this.alignTextSub.get();
            this.updateDisplayElement();
        }
    }

    public async onBlur(validateAndUpdate: boolean = true) {
        if (this.props.disabled?.get() === false && this.props.inactive?.get() === false && this.isFocused.get() === true) {
            this.isFocused.set(false);
            Coherent.trigger('UNFOCUS_INPUT_FIELD');
            this.textInputRef.instance.classList.remove('valueSelected');
            this.caretRef.instance.style.display = 'none';
            this.updateDisplayElement();

            if (validateAndUpdate) {
                if (this.modifiedFieldValue.get() === null && this.props.value.get() !== null) {
                    console.log('Enter pressed after no modification');
                    // Enter is pressed after no modification
                    const [formatted] = this.props.dataEntryFormat.format(this.props.value.get());
                    await this.validateAndUpdate(formatted ?? '');
                } else {
                    await this.validateAndUpdate(this.modifiedFieldValue.get() ?? '');
                }
            }

            // Restore mandatory class for correct coloring of dot (e.g. non-placeholders)
            if (!this.props.value.get() && this.props.mandatory?.get() === true) {
                this.textInputRef.instance.classList.add('mandatory');
            }

            this.spanningDivRef.instance.style.justifyContent = this.alignTextSub.get();
            this.textInputRef.instance.classList.remove('editing');
        }
    }

    private populatePlaceholders() {
        const [formatted, unitLeading, unitTrailing] = this.props.dataEntryFormat.format(null);
        this.leadingUnit.set(unitLeading ?? '');
        this.trailingUnit.set(unitTrailing ?? '');

        if (this.props.mandatory?.get() === true && this.props.inactive?.get() === false && this.props.disabled?.get() === false) {
            this.textInputRef.instance.innerHTML = formatted?.replace(/-/gi, emptyMandatoryCharacter(this.isFocused.get())) ?? '';
        } else {
            this.textInputRef.instance.innerText = formatted ?? '';
        }
    }

    private async validateAndUpdate(input: string) {
        this.isValidating.set(true);

        let newValue = null;
        try {
            newValue = await this.props.dataEntryFormat.parse(input);
        } catch (msg: unknown) {
            if (msg instanceof FmsError && this.props.errorHandler) {
                this.props.errorHandler(msg.type);
                newValue = null;
            }
        }

        let updateWasSuccessful = true;
        const artificialWaitingTime = new Promise((resolve) => setTimeout(resolve, 500));
        if (this.props.dataHandlerDuringValidation) {
            try {
                const realWaitingTime = this.props.dataHandlerDuringValidation(newValue, this.props.value.get());
                const [validation] = await Promise.all([realWaitingTime, artificialWaitingTime]);

                if (validation === false) {
                    updateWasSuccessful = false;
                }
            } catch {
                updateWasSuccessful = false;
                await artificialWaitingTime;
            }
        } else {
            await artificialWaitingTime;
        }

        if (updateWasSuccessful) {
            if (this.props.onModified) {
                this.props.onModified(newValue);
            } else if (this.props.value instanceof Subject) {
                this.props.value.set(newValue);
            } else {
                console.error('InputField: this.props.value not of type Subject, and no onModified handler was defined');
            }
        }

        this.modifiedFieldValue.set(null);
        this.isValidating.set(false);
    }

    onAfterRender(node: VNode): void {
        super.onAfterRender(node);

        // Optional props
        if (this.props.mandatory === undefined) {
            this.props.mandatory = Subject.create(false);
        }
        if (this.props.inactive === undefined) {
            this.props.inactive = Subject.create(false);
        }
        if (this.props.disabled === undefined) {
            this.props.disabled = Subject.create(false);
        }
        if (this.props.canBeCleared === undefined) {
            this.props.canBeCleared = Subject.create(true);
        }
        if (this.props.enteredByPilot === undefined) {
            this.props.enteredByPilot = Subject.create(true);
        }
        if (this.props.alignText === undefined) {
            this.props.alignText = 'flex-end';
        }
        if (this.props.handleFocusBlurExternally === undefined) {
            this.props.handleFocusBlurExternally = false;
        }
        if (this.props.canOverflow === undefined) {
            this.props.canOverflow = false;
        }
        if (this.props.tmpyActive === undefined) {
            this.props.tmpyActive = Subject.create(false);
        }

        // Aspect ratio for font: 2:3 WxH
        this.spanningDivRef.instance.style.minWidth = `${Math.round(this.props.dataEntryFormat.maxDigits * 27.0 / 1.5)}px`;

        // Hide caret
        this.caretRef.instance.style.display = 'none';
        this.caretRef.instance.innerText = '';

        this.subs.push(this.props.value.sub(() => this.onNewValue(), true));
        this.subs.push(this.modifiedFieldValue.sub(() => this.updateDisplayElement()));
        this.subs.push(this.isValidating.sub((val) => {
            if (val === true) {
                this.textInputRef.instance.classList.add('validating');
            } else {
                this.textInputRef.instance.classList.remove('validating');
            }
        }));

        this.subs.push(this.props.mandatory.sub((val) => {
            if (val === true && !this.props.value.get()) {
                this.textInputRef.instance.classList.add('mandatory');
            } else {
                this.textInputRef.instance.classList.remove('mandatory');
            }
            this.updateDisplayElement();
        }, true));

        this.subs.push(this.props.inactive.sub((val) => {
            if (val === true) {
                this.containerRef.instance.classList.add('inactive');
                this.textInputRef.instance.classList.add('inactive');

                this.textInputRef.instance.tabIndex = 0;
            } else {
                this.containerRef.instance.classList.remove('inactive');
                this.textInputRef.instance.classList.remove('inactive');

                if (this.props.disabled?.get() === false) {
                    this.textInputRef.instance.tabIndex = -1;
                }
            }
            this.updateDisplayElement();
        }, true));

        this.subs.push(this.props.disabled.sub((val) => {
            if (this.props.inactive?.get() !== true) {
                if (val === true) {
                    this.textInputRef.instance.tabIndex = 0;
                    this.containerRef.instance.classList.add('disabled');
                    this.textInputRef.instance.classList.add('disabled');

                    if (this.props.mandatory?.get() === true && !this.props.value.get()) {
                        this.textInputRef.instance.classList.remove('mandatory');
                    }
                } else {
                    this.textInputRef.instance.tabIndex = -1;
                    this.containerRef.instance.classList.remove('disabled');
                    this.textInputRef.instance.classList.remove('disabled');

                    if (this.props.mandatory?.get() === true && !this.props.value.get()) {
                        this.textInputRef.instance.classList.add('mandatory');
                    }
                }
            }
            this.updateDisplayElement();
        }, true));

        this.subs.push(this.props.enteredByPilot.sub((val) => {
            if (val === false) {
                this.textInputRef.instance.classList.add('computedByFms');
            } else {
                this.textInputRef.instance.classList.remove('computedByFms');
            }
        }, true));

        this.subs.push(this.props.tmpyActive.sub((v) => {
            if (v === true) {
                this.textInputRef.instance.classList.add('tmpy');
            } else {
                this.textInputRef.instance.classList.remove('tmpy');
            }
        }, true));

        if (this.props.dataEntryFormat.reFormatTrigger) {
            this.subs.push(this.props.dataEntryFormat.reFormatTrigger.sub(() => this.updateDisplayElement()));
        }

        this.textInputRef.instance.addEventListener('keypress', (ev) => this.onKeyPress(ev));
        this.textInputRef.instance.addEventListener('keydown', (ev) => this.onKeyDown(ev));

        if (!this.props.handleFocusBlurExternally) {
            this.textInputRef.instance.addEventListener('focus', () => this.onFocus());
            this.textInputRef.instance.addEventListener('blur', () => {
                this.onBlur();
            });
            this.spanningDivRef.instance.addEventListener('click', () => {
                this.textInputRef.instance.focus();
            });
            this.leadingUnitRef.instance.addEventListener('click', () => {
                this.textInputRef.instance.focus();
            });
            this.trailingUnitRef.instance.addEventListener('click', () => {
                this.textInputRef.instance.focus();
            });
        }

        /* if (this.props.inViewEvent) {
            this.subs.push(this.props.inViewEvent.whenChanged().handle((inView) =>
            {
                console.warn('inView: ' + inView);
                if (!inView) {
                    this.onBlur();
                }
            }));
        } */
    }

    render(): VNode {
        return (
            <div ref={this.topRef} class="mfd-input-field-root">
                <div ref={this.containerRef} class="mfd-input-field-container" style={`${this.props.containerStyle}`}>
                    <span ref={this.leadingUnitRef} class="mfd-label-unit mfd-unit-leading mfd-input-field-unit">{this.leadingUnit}</span>
                    <div ref={this.spanningDivRef} class="mfd-input-field-text-input-container" style={`justify-content: ${this.props.alignText};`}>
                        <span
                            ref={this.textInputRef}
                            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                            tabIndex={-1}
                            class="mfd-input-field-text-input"
                        >
                            .
                        </span>
                        <span ref={this.caretRef} class="mfd-input-field-caret" />
                    </div>
                    <span ref={this.trailingUnitRef} class="mfd-label-unit mfd-unit-trailing mfd-input-field-unit">{this.trailingUnit}</span>
                </div>
            </div>
        );
    }
}