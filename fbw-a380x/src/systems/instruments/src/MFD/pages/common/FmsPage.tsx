import { FlightPlanIndex } from '@fmgc/flightplanning/new/FlightPlanManager';
import { FlightPlan } from '@fmgc/flightplanning/new/plans/FlightPlan';
import { FlightPlanSyncEvents } from '@fmgc/flightplanning/new/sync/FlightPlanSyncEvents';
import { DisplayComponent, FSComponent, Subject, Subscription, VNode } from '@microsoft/msfs-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { AbstractMfdPageProps } from 'instruments/src/MFD/MFD';
import { NXSystemMessages } from 'instruments/src/MFD/pages/FMS/legacy/NXSystemMessages';
import { ActivePageTitleBar } from 'instruments/src/MFD/pages/common/ActivePageTitleBar';
import { MfdSimvars } from 'instruments/src/MFD/shared/MFDSimvarPublisher';

export abstract class FmsPage<T extends AbstractMfdPageProps> extends DisplayComponent<T> {
    // Make sure to collect all subscriptions here, otherwise page navigation doesn't work.
    protected subs = [] as Subscription[];

    private newDataIntervalId: number;

    protected activePageTitle = Subject.create<string>('');

    public loadedFlightPlan: FlightPlan;

    protected loadedFlightPlanIndex = Subject.create<FlightPlanIndex>(FlightPlanIndex.Active);

    protected currentFlightPlanVersion: number = 0;

    protected tmpyActive = Subject.create<boolean>(false);

    protected secActive = Subject.create<boolean>(false);

    protected activeFlightPhase = Subject.create<FmgcFlightPhase>(FmgcFlightPhase.Preflight);

    public onAfterRender(node: VNode): void {
        super.onAfterRender(node);

        const sub = this.props.bus.getSubscriber<MfdSimvars>();

        this.subs.push(sub.on('flightPhase').whenChanged().handle((val) => {
            this.activeFlightPhase.set(val);
        }));

        this.subs.push(this.props.uiService.activeUri.sub((val) => {
            this.activePageTitle.set(`${val.category.toUpperCase()}/${this.props.pageTitle}`);
        }, true));

        // Check if flight plan changed using flight plan sync bus events
        const flightPlanSyncSub = this.props.bus.getSubscriber<FlightPlanSyncEvents>();

        this.subs.push(flightPlanSyncSub.on('flightPlanManager.create').handle(() => {
            this.onFlightPlanChanged();
        }));

        this.subs.push(flightPlanSyncSub.on('flightPlanManager.delete').handle((data) => {
            if (data.planIndex === this.loadedFlightPlan.index) {
                this.onFlightPlanChanged();
            }
        }));

        this.subs.push(flightPlanSyncSub.on('flightPlanManager.deleteAll').handle(() => {
            this.onFlightPlanChanged();
        }));

        this.subs.push(flightPlanSyncSub.on('flightPlanManager.swap').handle((data) => {
            if (data.planIndex === this.loadedFlightPlan.index || data.targetPlanIndex === this.loadedFlightPlan.index) {
                this.onFlightPlanChanged();
            }
        }));

        this.subs.push(flightPlanSyncSub.on('flightPlanManager.copy').handle((data) => {
            if (data.planIndex === this.loadedFlightPlan.index || data.targetPlanIndex === this.loadedFlightPlan.index) {
                this.onFlightPlanChanged();
            }
        }));

        this.onFlightPlanChanged();
        this.onNewDataChecks();
        this.onNewData();
        this.newDataIntervalId = setInterval(() => this.checkIfNewData(), 500);
    }

    protected checkIfNewData() {
        // Check for current flight plan, whether it has changed (TODO switch to Subscribable in the future)
        if (this.loadedFlightPlan.version !== this.currentFlightPlanVersion) {
            this.onNewDataChecks();
            this.onNewData();
            this.currentFlightPlanVersion = this.loadedFlightPlan.version;
        }
    }

    protected onFlightPlanChanged() {
        switch (this.props.uiService.activeUri.get().category) {
        case 'active':
            this.loadedFlightPlan = this.props.fmService.flightPlanService.activeOrTemporary;
            this.loadedFlightPlanIndex.set(this.props.fmService.flightPlanService.hasTemporary ? FlightPlanIndex.Temporary : FlightPlanIndex.Active);
            this.secActive.set(false);
            this.tmpyActive.set(this.props.fmService.flightPlanService.hasTemporary);
            break;
        case 'sec1':
            this.loadedFlightPlan = this.props.fmService.flightPlanService.secondary(1);
            this.loadedFlightPlanIndex.set(FlightPlanIndex.FirstSecondary);
            this.secActive.set(true);
            this.tmpyActive.set(false);
            break;
        case 'sec2':
            this.loadedFlightPlan = this.props.fmService.flightPlanService.secondary(2);
            this.loadedFlightPlanIndex.set(FlightPlanIndex.FirstSecondary + 1);
            this.secActive.set(true);
            this.tmpyActive.set(false);
            break;
        case 'sec3':
            this.loadedFlightPlan = this.props.fmService.flightPlanService.secondary(3);
            this.loadedFlightPlanIndex.set(FlightPlanIndex.FirstSecondary + 2);
            this.secActive.set(true);
            this.tmpyActive.set(false);
            break;

        default:
            this.loadedFlightPlan = this.props.fmService.flightPlanService.activeOrTemporary;
            break;
        }
        this.onNewDataChecks();
        this.onNewData();
        this.currentFlightPlanVersion = this.loadedFlightPlan.version;
    }

    protected abstract onNewData();

    private onNewDataChecks() {
        const fm = this.props.fmService.fmgc.data;
        const pd = this.loadedFlightPlan.performanceData;

        if (this.loadedFlightPlan.originRunway) {
            if (fm.vSpeedsForRunway.get() === undefined) {
                fm.vSpeedsForRunway.set(this.loadedFlightPlan.originRunway.ident);
            } else if (fm.vSpeedsForRunway.get() !== this.loadedFlightPlan.originRunway.ident) {
                fm.vSpeedsForRunway.set(this.loadedFlightPlan.originRunway.ident);
                fm.v1ToBeConfirmed.set(pd.v1);
                this.loadedFlightPlan.setPerformanceData('v1', undefined);
                fm.vrToBeConfirmed.set(pd.vr);
                this.loadedFlightPlan.setPerformanceData('vr', undefined);
                fm.v2ToBeConfirmed.set(pd.v2);
                this.loadedFlightPlan.setPerformanceData('v2', undefined);

                this.props.fmService.mfd.addMessageToQueue(NXSystemMessages.checkToData);
            }
        }
    }

    public destroy(): void {
        // Destroy all subscriptions to remove all references to this instance.
        this.subs.forEach((x) => x.destroy());

        clearInterval(this.newDataIntervalId);

        super.destroy();
    }

    render(): VNode {
        return (
            <ActivePageTitleBar activePage={this.activePageTitle} offset={Subject.create('')} eoIsActive={Subject.create(false)} tmpyIsActive={this.tmpyActive} />
        );
    }
}