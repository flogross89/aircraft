import { ComponentProps, DisplayComponent, FSComponent, MappedSubject, Subject, Subscription, VNode } from '@microsoft/msfs-sdk';

import './MfdFmsFpln.scss';
import { IconButton } from 'instruments/src/MFD/pages/common/IconButton';
import { Button } from 'instruments/src/MFD/pages/common/Button';
import { ActivePageTitleBar } from 'instruments/src/MFD/pages/common/ActivePageTitleBar';
import { Coordinates, NauticalMiles, distanceTo } from 'msfs-geo';
import { FmcServiceInterface } from 'instruments/src/MFD/FMC/FmcServiceInterface';
import { DatabaseItem, MegaHertz, NdbNavaid, VhfNavaid, Waypoint } from '@flybywiresim/fbw-sdk';

interface MfdFmsFplnDuplicateNamesProps extends ComponentProps {
    visible: Subject<boolean>;
    fmcService: FmcServiceInterface;
}

type DuplicateWaypointData = {
    ident: string;
    distance: NauticalMiles;
    location: Coordinates;
    freqChan?: MegaHertz;
    fixData: DatabaseItem<any>;
};

function isNavaid(fix: DatabaseItem<any>): fix is (VhfNavaid | NdbNavaid) {
    return 'frequency' in fix;
}

function isNavaidOrWaypoint(fix: DatabaseItem<any>): fix is (VhfNavaid | NdbNavaid | Waypoint) {
    return 'location' in fix;
}

export class MfdFmsFplnDuplicateNames extends DisplayComponent<MfdFmsFplnDuplicateNamesProps> {
    // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
    private subs = [] as Subscription[];

    private resolveItemIndex: number | undefined;

    private isResolved: boolean = false;

    private topRef = FSComponent.createRef<HTMLDivElement>();

    private linesDivRef = FSComponent.createRef<HTMLDivElement>();

    private returnButtonRef = FSComponent.createRef<Button>();

    private duplicateOptions = Subject.create<DuplicateWaypointData[]>([]);

    private displayFromWaypointIndex = Subject.create<number>(0);

    private disabledScrollDown = MappedSubject.create(([options, fromIndex]) => !(options.length > (fromIndex + 10)), this.duplicateOptions, this.displayFromWaypointIndex);

    private disabledScrollUp = MappedSubject.create(([, fromIndex]) => !(fromIndex > 0), this.duplicateOptions, this.displayFromWaypointIndex);

    public onAfterRender(node: VNode): void {
        super.onAfterRender(node);

        this.subs.push(this.displayFromWaypointIndex.sub((idx) => this.update(idx)));
        this.subs.push(this.props.visible.sub((vis) => {
            if (this.topRef.getOrDefault()) {
                this.topRef.instance.style.display = vis ? 'block' : 'none';
            }
        }, true));

        this.update(0);
    }

    private async loadIdent<T extends DatabaseItem<any>>(items: T[]) {
        if (!items) {
            return;
        }
        const result: DuplicateWaypointData[] = [];
        items.forEach((fx) => {
            if (isNavaid(fx)) {
                const dwd: DuplicateWaypointData = {
                    ident: fx.ident,
                    distance: distanceTo(fx.location, this.props.fmcService?.master?.navigation.getPpos() ?? { lat: 0, long: 0 }),
                    location: fx.location,
                    freqChan: fx.frequency,
                    fixData: fx,
                };
                result.push(dwd);
            } else if (isNavaidOrWaypoint(fx)) {
                const dwd: DuplicateWaypointData = {
                    ident: fx.ident,
                    distance: distanceTo(fx.location, this.props.fmcService?.master?.navigation.getPpos() ?? { lat: 0, long: 0 }),
                    location: fx.location,
                    freqChan: undefined,
                    fixData: fx,
                };
                result.push(dwd);
            }
        });

        // Sort by ascending distance and set data
        this.duplicateOptions.set(result.sort((a, b) => (a.distance - b.distance)));

        this.update(0);
    }

    private update(startAtIndex: number): void {
        while (this.linesDivRef.instance.firstChild) {
            this.linesDivRef.instance.removeChild(this.linesDivRef.instance.firstChild);
        }

        for (let i = startAtIndex; i < startAtIndex + 10; i++) {
            if (this.duplicateOptions.get()[i] !== undefined) {
                const fix = this.duplicateOptions.get()[i];
                // eslint-disable-next-line max-len
                const latLonString = `${Math.round(Math.abs(fix.location.lat)).toFixed(0).padStart(2, '0')}${fix.location.lat > 0 ? 'N' : 'S'}/${Math.round(Math.abs(fix.location.long)).toFixed(0).padStart(3, '0')}${fix.location.long > 0 ? 'E' : 'W'}`;
                const node: VNode = (
                    <div class="mfd-fms-fpln-duplicate-table-row" id={`mfd-fms-dupl-${i}`}>
                        <div style="width: 20%">
                            <span class="mfd-value bigger">{fix.ident ?? '\u00A0'}</span>
                        </div>
                        <div style="width: 20%">
                            <span class="mfd-value bigger">{Math.round(fix.distance).toFixed(0) ?? '\u00A0'}</span>
                        </div>
                        <div style="width: 30%">
                            <span class="mfd-value bigger">{latLonString ?? '\u00A0'}</span>
                        </div>
                        <div style="width: 30%">
                            <span class="mfd-value bigger">{(fix.freqChan && fix.freqChan > 120) ? fix.freqChan.toFixed(0) : (fix.freqChan?.toFixed(2) ?? '\u00A0')}</span>
                        </div>
                    </div>
                );
                FSComponent.render(node, this.linesDivRef.instance);

                // These don't get explicitly deleted when re-rendering the list, TODO check if critical
                document.getElementById(`mfd-fms-dupl-${i}`)?.addEventListener('click', () => {
                    this.resolveItemIndex = i;
                    this.isResolved = true;
                });
            }
        }
    }

    private async waitUntilResolved() {
        while (this.isResolved === false) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }

    // Entry point after opening this dialog
    public async deduplicateFacilities<T extends DatabaseItem<any>>(items: T[]): Promise<T | undefined> {
        this.isResolved = false;
        this.loadIdent(items);

        await this.waitUntilResolved();

        return (this.resolveItemIndex !== undefined) ? items[this.resolveItemIndex] : undefined;
    }

    public destroy(): void {
        // Destroy all subscriptions to remove all references to this instance.
        this.subs.forEach((x) => x.destroy());

        super.destroy();
    }

    render(): VNode {
        return (
            <div ref={this.topRef} class="mfd-fms-fpln-dialog-outer">
                <div class="mfd-fms-fpln-dialog-inner">
                    <ActivePageTitleBar activePage={Subject.create('DUPLICATE NAMES')} offset={Subject.create('')} eoIsActive={Subject.create(false)} tmpyIsActive={Subject.create(false)} />
                    {/* begin page content */}
                    <div class="mfd-fms-fpln-duplicate-table" style="margin-top: 100px;">
                        <div class="mfd-fms-fpln-duplicate-table-header">
                            <div style="width: 20%"><span class="mfd-label">IDENT</span></div>
                            <div style="width: 20%"><span class="mfd-label">DIST(NM)</span></div>
                            <div style="width: 30%"><span class="mfd-label">LAT/LONG</span></div>
                            <div style="width: 30%"><span class="mfd-label">FREQ/CHAN</span></div>
                        </div>
                    </div>
                    <div class="mfd-fms-fpln-duplicate-outline mfd-fms-fpln-label-bottom-space">
                        <div ref={this.linesDivRef} class="mfd-fms-fpln-duplicate-table" />
                        <div style="flex-grow: 1;" />
                    </div>
                    <div style="display: flex; flex-direction: row; justify-content: center">
                        <IconButton
                            icon="double-down"
                            onClick={() => this.displayFromWaypointIndex.set(this.displayFromWaypointIndex.get() + 1)}
                            disabled={this.disabledScrollDown}
                            containerStyle="width: 60px; height: 60px; margin-right: 20px;"
                        />
                        <IconButton
                            icon="double-up"
                            onClick={() => this.displayFromWaypointIndex.set(this.displayFromWaypointIndex.get() - 1)}
                            disabled={this.disabledScrollUp}
                            containerStyle="width: 60px; height: 60px;"
                        />
                    </div>
                    <div style="flex-grow: 1;" />
                    <div style="display: flex; flex-direction: row; justify-content: space-between;">
                        <div style="display: flex; justify-content: flex-end; padding: 2px;">
                            <Button
                                ref={this.returnButtonRef}
                                label="RETURN"
                                onClick={() => {
                                    this.resolveItemIndex = undefined;
                                    this.isResolved = true;
                                }}
                            />
                        </div>
                    </div>
                    {/* end page content */}
                </div>
            </div>
        );
    }
}