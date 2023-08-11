/* eslint-disable jsx-a11y/label-has-associated-control */

import 'instruments/src/MFD/pages/common/style.scss';

import { ArraySubject, ClockEvents, ComponentProps, DisplayComponent, EventBus, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { FmsHeader } from 'instruments/src/MFD/pages/common/FmsHeader';
import { MouseCursor } from 'instruments/src/MFD/pages/common/MouseCursor';
import { MfdFmsPerf } from 'instruments/src/MFD/pages/FMS/PERF';
import { MfdFmsInit } from 'instruments/src/MFD/pages/FMS/INIT';

import { FlightPlanService } from '@fmgc/flightplanning/new/FlightPlanService';

import { MfdNotFound } from 'instruments/src/MFD/pages/FMS/NOT_FOUND';
import { FcuBkupHeader } from 'instruments/src/MFD/pages/common/FcuBkupHeader';
import { SurvHeader } from 'instruments/src/MFD/pages/common/SurvHeader';
import { AtccomHeader } from 'instruments/src/MFD/pages/common/AtccomHeader';
import { MfdFmsFuelLoad } from 'instruments/src/MFD/pages/FMS/FUEL_LOAD';
import { MfdFmsFpln } from 'instruments/src/MFD/pages/FMS/F-PLN/F-PLN';
import { MfdMsgList } from 'instruments/src/MFD/pages/FMS/MSG_LIST';
import { ActiveUriInformation, MfdUIService } from 'instruments/src/MFD/pages/common/UIService';
import { MfdFmsFplnDep } from 'instruments/src/MFD/pages/FMS/F-PLN/DEPARTURE';
import { MfdFmsFplnArr } from 'instruments/src/MFD/pages/FMS/F-PLN/ARRIVAL';
import { NavigationDatabase, NavigationDatabaseBackend } from '@fmgc/NavigationDatabase';
import { NavigationDatabaseService } from '@fmgc/flightplanning/new/NavigationDatabaseService';
import { MfdSimvars } from './shared/MFDSimvarPublisher';
import { DisplayUnit } from '../MsfsAvionicsCommon/displayUnit';

export const getDisplayIndex = () => {
    const url = document.getElementsByTagName('a380x-mfd')[0].getAttribute('url');
    return url ? parseInt(url.substring(url.length - 1), 10) : 0;
};

export interface AbstractMfdPageProps extends ComponentProps {
    pageTitle?: string;
    bus: EventBus;
    uiService: MfdUIService;
    flightPlanService: FlightPlanService;
}

interface MfdComponentProps extends ComponentProps {
    bus: EventBus;
    instrument: BaseInstrument;
}
export class MfdComponent extends DisplayComponent<MfdComponentProps> {
    private uiService = new MfdUIService();

    private flightPlanService = new FlightPlanService(this.props.bus);

    private displayBrightness = Subject.create(0);

    private displayPowered = Subject.create(false);

    private activeFmsSource = Subject.create<'FMS 1' | 'FMS 2' | 'FMS 1-C' | 'FMS 2-C'>('FMS 1');

    private mouseCursorRef = FSComponent.createRef<MouseCursor>();

    private topRef = FSComponent.createRef<HTMLDivElement>();

    private activePageRef = FSComponent.createRef<HTMLDivElement>();

    private activePage: VNode = null;

    private activeHeaderRef = FSComponent.createRef<HTMLDivElement>();

    private activeHeader: VNode = null;

    // Necessary to enable mouse interaction
    get isInteractive(): boolean {
        return true;
    }

    private async initializeFlightPlans() {
        NavigationDatabaseService.activeDatabase = new NavigationDatabase(NavigationDatabaseBackend.Msfs);
        await new Promise((r) => setTimeout(r, 1000));
        this.flightPlanService.createFlightPlans();

        this.flightPlanService.newCityPair('EGLL', 'LFPG', 'EBBR');
    }

    public async onAfterRender(node: VNode): Promise<void> {
        super.onAfterRender(node);

        await this.initializeFlightPlans();

        const isCaptainSide = getDisplayIndex() === 1;

        this.activeFmsSource.set(isCaptainSide ? 'FMS 1' : 'FMS 2');

        const sub = this.props.bus.getSubscriber<ClockEvents & MfdSimvars>();

        sub.on(isCaptainSide ? 'potentiometerCaptain' : 'potentiometerFo').whenChanged().handle((value) => {
            this.displayBrightness.set(value);
        });

        sub.on(isCaptainSide ? 'elec' : 'elecFo').whenChanged().handle((value) => {
            this.displayPowered.set(value);
        });

        this.uiService.activeUri.sub((uri) => this.activeUriChanged(uri));

        this.topRef.instance.addEventListener('mousemove', (ev) => {
            this.mouseCursorRef.instance.updatePosition(ev.clientX, ev.clientY);
        });

        // Navigate to initial page
        this.uiService.navigateTo('fms/active/init');
    }

    private activeUriChanged(uri: ActiveUriInformation) {
        // Remove and destroy old header
        while (this.activeHeaderRef.getOrDefault().firstChild) {
            this.activeHeaderRef.getOrDefault().removeChild(this.activeHeaderRef.getOrDefault().firstChild);
        }
        if (this.activeHeader && this.activeHeader.instance instanceof DisplayComponent) {
            this.activeHeader.instance.destroy();
        }

        // Remove and destroy old MFD page
        while (this.activePageRef.getOrDefault().firstChild) {
            this.activePageRef.getOrDefault().removeChild(this.activePageRef.getOrDefault().firstChild);
        }
        if (this.activePage && this.activePage.instance instanceof DisplayComponent) {
            this.activePage.instance.destroy();
        }

        // Different systems use different navigation bars
        switch (uri.sys) {
        case 'fms':
            this.activeHeader = (
                <FmsHeader
                    bus={this.props.bus}
                    callsign={Subject.create('FBW123')}
                    activeFmsSource={this.activeFmsSource}
                    uiService={this.uiService}
                    flightPlanService={this.flightPlanService}
                />
            );
            break;
        case 'atccom':
            this.activeHeader = (
                <AtccomHeader
                    bus={this.props.bus}
                    callsign={Subject.create('FBW123')}
                    activeFmsSource={this.activeFmsSource}
                    uiService={this.uiService}
                    flightPlanService={this.flightPlanService}
                />
            );
            break;
        case 'surv':
            this.activeHeader = (
                <SurvHeader
                    bus={this.props.bus}
                    callsign={Subject.create('FBW123')}
                    activeFmsSource={this.activeFmsSource}
                    uiService={this.uiService}
                    flightPlanService={this.flightPlanService}
                />
            );
            break;
        case 'fcubkup':
            this.activeHeader = (
                <FcuBkupHeader
                    bus={this.props.bus}
                    callsign={Subject.create('FBW123')}
                    activeFmsSource={this.activeFmsSource}
                    uiService={this.uiService}
                    flightPlanService={this.flightPlanService}
                />
            );
            break;

        default:
            this.activeHeader = (
                <FmsHeader
                    bus={this.props.bus}
                    callsign={Subject.create('FBW123')}
                    activeFmsSource={this.activeFmsSource}
                    uiService={this.uiService}
                    flightPlanService={this.flightPlanService}
                />
            );
            break;
        }

        // Mapping from URL to page component
        switch (`${uri.sys}/${uri.category}/${uri.page}`) {
        case 'fms/active/perf':
            this.activePage = <MfdFmsPerf pageTitle="PERF" bus={this.props.bus} uiService={this.uiService} flightPlanService={this.flightPlanService} />;
            break;
        case 'fms/active/init':
            this.activePage = <MfdFmsInit pageTitle="INIT" bus={this.props.bus} uiService={this.uiService} flightPlanService={this.flightPlanService} />;
            break;
        case 'fms/active/fuel-load':
            this.activePage = <MfdFmsFuelLoad pageTitle="FUEL&LOAD" bus={this.props.bus} uiService={this.uiService} flightPlanService={this.flightPlanService} />;
            break;
        case 'fms/active/f-pln':
            this.activePage = <MfdFmsFpln pageTitle="F-PLN" bus={this.props.bus} uiService={this.uiService} flightPlanService={this.flightPlanService} />;
            break;
        case 'fms/active/f-pln-departure':
            this.activePage = <MfdFmsFplnDep pageTitle="F-PLN/DEPARTURE" bus={this.props.bus} uiService={this.uiService} flightPlanService={this.flightPlanService} />;
            break;
        case 'fms/active/f-pln-arrival':
            this.activePage = <MfdFmsFplnArr pageTitle="F-PLN/ARRIVAL" bus={this.props.bus} uiService={this.uiService} flightPlanService={this.flightPlanService} />;
            break;

        default:
            this.activePage = <MfdNotFound pageTitle="NOT FOUND" bus={this.props.bus} uiService={this.uiService} flightPlanService={this.flightPlanService} />;
            break;
        }

        if (uri.page === 'msg-list') {
            this.activePage = (
                <MfdMsgList
                    // eslint-disable-next-line max-len
                    messages={ArraySubject.create(['CLOSE RTE REQUEST FIRST', 'RECEIVED POS T.O DATA NOT VALID', 'CONSTRAINTS ABOVE CRZ FL DELETED', 'NOT IN DATABASE', 'GPS PRIMARY', 'CHECK T.O DATA'])}
                    bus={this.props.bus}
                    uiService={this.uiService}
                    flightPlanService={this.flightPlanService}
                />
            );
        }

        FSComponent.render(this.activeHeader, this.activeHeaderRef.getOrDefault());
        FSComponent.render(this.activePage, this.activePageRef?.getOrDefault());
    }

    render(): VNode {
        return (
            <DisplayUnit bus={this.props.bus} normDmc={1} brightness={this.displayBrightness} powered={this.displayPowered}>
                <div class="mfd-main" ref={this.topRef}>
                    <div ref={this.activeHeaderRef} />
                    <div ref={this.activePageRef} class="mfd-navigator-container" />
                    <MouseCursor side={Subject.create('CPT')} ref={this.mouseCursorRef} />
                </div>
            </DisplayUnit>
        );
    }
}