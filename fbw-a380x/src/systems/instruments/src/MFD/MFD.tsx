/* eslint-disable jsx-a11y/label-has-associated-control */

import 'instruments/src/MFD/pages/common/style.scss';

import {
    ArraySubject,
    ClockEvents,
    ComponentProps,
    DisplayComponent,
    EventBus,
    FSComponent,
    SimVarValueType,
    Subject,
    VNode,
} from '@microsoft/msfs-sdk';

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
import { MfdFmsFplnDirectTo } from 'instruments/src/MFD/pages/FMS/F-PLN/DIRECT-TO';
import { NavigationDatabase, NavigationDatabaseBackend } from '@fmgc/NavigationDatabase';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { Coordinates, distanceTo } from 'msfs-geo';
import { EfisSymbols } from '@fmgc/efis/EfisSymbols';
import { NavaidTuner } from '@fmgc/navigation/NavaidTuner';
import { NavaidSelectionManager } from '@fmgc/navigation/NavaidSelectionManager';
import { LandingSystemSelectionManager } from '@fmgc/navigation/LandingSystemSelectionManager';
import { NavigationDatabaseService } from '@fmgc/flightplanning/new/NavigationDatabaseService';
import { MfdFlightManagementService } from 'instruments/src/MFD/pages/common/FlightManagementService';
import { MfdFmsFplnDuplicateNames } from 'instruments/src/MFD/pages/FMS/F-PLN/DUPLICATE_NAMES';
import { DatabaseItem, Waypoint } from 'msfs-navdata';
import { DataInterface } from '@fmgc/flightplanning/new/interface/DataInterface';
import { DisplayInterface } from '@fmgc/flightplanning/new/interface/DisplayInterface';
import { FmsErrorType } from '@fmgc/FmsError';

import { WaypointFactory } from '@fmgc/flightplanning/new/waypoints/WaypointFactory';
import { FmgcDataInterface } from 'instruments/src/MFD/fmgc';
import { MfdFmsFplnAirways } from 'instruments/src/MFD/pages/FMS/F-PLN/AIRWAYS';
import { MfdFmsPositionIrs } from 'instruments/src/MFD/pages/FMS/POSITION/IRS';
import { NavigationProvider } from '@fmgc/navigation/NavigationProvider';
import { getFlightPhaseManager } from '@fmgc/flightphase';
import { FmgcFlightPhase } from '@shared/flightphase';
import { NXDataStore } from '@flybywiresim/fbw-sdk';
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
    fmService: MfdFlightManagementService;
}

interface MfdComponentProps extends ComponentProps {
    bus: EventBus;
    instrument: BaseInstrument;
}

export interface FmsErrorMessage {
    message: string;
    backgroundColor: 'none' | 'amber' | 'cyan'; // Whether the message should be colored. White text on black background if 'none'
    cleared: boolean; // If message has been cleared from footer
    isResolvedOverride: () => void;
    onClearOverride: () => void;
}
export class MfdComponent extends DisplayComponent<MfdComponentProps> implements DisplayInterface, DataInterface {
    private uiService = new MfdUIService();

    private flightPlanService = new FlightPlanService(this.props.bus);

    private fmgc = new FmgcDataInterface(this.flightPlanService);

    private guidanceController = new GuidanceController(this.fmgc, this.flightPlanService);

        private navigationProvider: NavigationProvider = {
            getEpe(): number {
                return 0.1;
            },
            getPpos(): Coordinates | null {
                const lat = SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree);
                const long = SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree);

                return { lat, long };
            },
            getBaroCorrectedAltitude(): number | null {
                return 0;
            },
            getPressureAltitude(): number | null {
                return 0;
            },
            getRadioHeight(): number | null {
                return 0;
            },
        }

    private navaidSelectionManager = new NavaidSelectionManager(this.flightPlanService, this.navigationProvider);

    private landingSystemSelectionManager = new LandingSystemSelectionManager(this.flightPlanService, this.navigationProvider)

    private navaidTuner = new NavaidTuner(this.navigationProvider, this.navaidSelectionManager, this.landingSystemSelectionManager);

    private efisSymbols = new EfisSymbols(this.guidanceController, this.flightPlanService, this.navaidTuner);

    private flightPhaseManager = getFlightPhaseManager();

    private fmService = new MfdFlightManagementService(this, this.flightPlanService, this.guidanceController, this.fmgc, this.navigationProvider);

    public fmsErrors = ArraySubject.create<FmsErrorMessage>();

    private displayBrightness = Subject.create(0);

    private displayPowered = Subject.create(false);

    private activeFmsSource = Subject.create<'FMS 1' | 'FMS 2' | 'FMS 1-C' | 'FMS 2-C'>('FMS 1');

    private mouseCursorRef = FSComponent.createRef<MouseCursor>();

    private topRef = FSComponent.createRef<HTMLDivElement>();

    private activePageRef = FSComponent.createRef<HTMLDivElement>();

    private activePage: VNode = null;

    private activeHeaderRef = FSComponent.createRef<HTMLDivElement>();

    private activeHeader: VNode = null;

    private messageListOpened = Subject.create<boolean>(false);

    private duplicateNamesOpened = Subject.create<boolean>(false);

    private duplicateNamesRef = FSComponent.createRef<MfdFmsFplnDuplicateNames>();

    private destDataChecked = false;

    // Necessary to enable mouse interaction
    get isInteractive(): boolean {
        return true;
    }

    private async initializeFlightPlans() {
        const db = new NavigationDatabase(NavigationDatabaseBackend.Msfs);
        NavigationDatabaseService.activeDatabase = db;
        await new Promise((r) => setTimeout(r, 2000));
        this.flightPlanService.createFlightPlans();

        // Intialize from MSFS flight data
        // this.flightPlanService.active.performanceData.cruiseFlightLevel.set(SimVar.GetGameVarValue('AIRCRAFT CRUISE ALTITUDE', 'feet'));

        // Build EDDM08R GIVMI6E GIVMI DCT DKB DCT ILS25L EDDF25L
        await this.flightPlanService.newCityPair('EDDM', 'EDDF', 'EBBR');
        await this.flightPlanService.setOriginRunway('RW08R');
        await this.flightPlanService.setDepartureProcedure('GIVM6E');
        await this.flightPlanService.nextWaypoint(4, (await db.searchAllFix('DKB'))[0]);
        await this.flightPlanService.setDestinationRunway('RW25L');
        await this.flightPlanService.setApproach('I25L');
        await this.flightPlanService.temporaryInsert();

        // Build EGLL/27R N0411F250 MAXI1F MAXIT DCT HARDY UM605 BIBAX BIBA9X LFPG/09L
        /* await this.flightPlanService.newCityPair('EGLL', 'LFPG', 'EBBR');
        await this.flightPlanService.setOriginRunway('RW27R');
        await this.flightPlanService.setDepartureProcedure('MAXI1F');
        await this.flightPlanService.nextWaypoint(8, (await db.searchAllFix('HARDY'))[0]);
        await this.flightPlanService.temporaryInsert();
        await this.flightPlanService.deleteElementAt(8);

        this.flightPlanService.active.startAirwayEntry(8);
        const awy = (await db.searchAirway('UM605', (await db.searchAllFix('HARDY'))[0]))[0];
        this.flightPlanService.active.pendingAirways.thenAirway(awy);
        this.flightPlanService.active.pendingAirways.thenTo((await db.searchAllFix('BIBAX'))[0]);
        this.flightPlanService.active.pendingAirways.finalize();

        await this.flightPlanService.setDestinationRunway('RW09R');
        // await this.flightPlanService.setApproach('I09R'); // throws errors
        // await this.flightPlanService.setApproachVia('MOP6E');
        // await this.flightPlanService.setArrival('BIBA9X');

        await this.flightPlanService.temporaryInsert();
        await this.flightPlanService.deleteElementAt(12); */

        // Default performance values
        this.flightPlanService.active.performanceData.pilotAccelerationAltitude.set(2_900);
        this.flightPlanService.active.performanceData.pilotThrustReductionAltitude.set(1_900);
        this.flightPlanService.active.performanceData.pilotTransitionAltitude.set(5_000);
        this.flightPlanService.active.performanceData.pilotEngineOutAccelerationAltitude.set(1_500);
        this.flightPlanService.active.performanceData.v1.set(120);
        this.flightPlanService.active.performanceData.vr.set(140);
        this.flightPlanService.active.performanceData.v2.set(145);
        this.fmService.fmgc.data.approachSpeed.set(145);
        this.fmService.fmgc.data.zeroFuelWeight.set(300_000);
        this.fmService.fmgc.data.zeroFuelWeightCenterOfGravity.set(26);
        this.fmService.fmgc.data.blockFuel.set(50_000);
        this.fmService.fmgc.data.costIndex.set(69);
        this.flightPlanService.active.performanceData.cruiseFlightLevel.set(24_000);
    }

    private init() {
        // Reset SimVars
        SimVar.SetSimVarValue('L:A32NX_SPEEDS_MANAGED_PFD', 'knots', 0);
        SimVar.SetSimVarValue('L:A32NX_SPEEDS_MANAGED_ATHR', 'knots', 0);

        SimVar.SetSimVarValue('L:A32NX_MachPreselVal', 'mach', -1);
        SimVar.SetSimVarValue('L:A32NX_SpeedPreselVal', 'knots', -1);

        SimVar.SetSimVarValue('L:AIRLINER_DECISION_HEIGHT', 'feet', -1);
        SimVar.SetSimVarValue('L:AIRLINER_MINIMUM_DESCENT_ALTITUDE', 'feet', 0);

        SimVar.SetSimVarValue(
            'L:A32NX_FG_ALTITUDE_CONSTRAINT',
            'feet',
            0,
        );
        SimVar.SetSimVarValue('L:A32NX_TO_CONFIG_NORMAL', 'Bool', 0);
        SimVar.SetSimVarValue('L:A32NX_CABIN_READY', 'Bool', 0);
        SimVar.SetSimVarValue('L:A32NX_FM_GROSS_WEIGHT', 'Number', 0);

        if (
            SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_DISABLED', 'number') === 1
        ) {
            SimVar.SetSimVarValue('K:A32NX.ATHR_RESET_DISABLE', 'number', 1);
        }

        SimVar.SetSimVarValue('L:A32NX_PFD_MSG_SET_HOLD_SPEED', 'bool', false);

        // Reset SimVars
        SimVar.SetSimVarValue('L:AIRLINER_V1_SPEED', 'Knots', NaN);
        SimVar.SetSimVarValue('L:AIRLINER_V2_SPEED', 'Knots', NaN);
        SimVar.SetSimVarValue('L:AIRLINER_VR_SPEED', 'Knots', NaN);

        const gpsDriven = SimVar.GetSimVarValue('GPS DRIVES NAV1', 'Bool');
        if (!gpsDriven) {
            SimVar.SetSimVarValue('K:TOGGLE_GPS_DRIVES_NAV1', 'Bool', 0);
        }
        SimVar.SetSimVarValue('K:VS_SLOT_INDEX_SET', 'number', 1);

        // Start the check routine for system health and status
        setInterval(() => {
            if (this.flightPhaseManager.phase === FmgcFlightPhase.Cruise && !this.destDataChecked) {
                const dest = this.flightPlanService.active.destinationAirport;
                const distanceFromPpos = distanceTo(this.navigationProvider.getPpos(), dest.location);
                if (dest && distanceFromPpos < 180) {
                    this.destDataChecked = true;
                    this.checkDestData();
                }
            }
        }, 15000);
    }

    /**
     * Called when a flight plan uplink is in progress
     */
    onUplinkInProgress() {
        this.fmService.fmgc.data.cpnyFplnUplinkInProgress.set(true);
    }

    /**
         * Called when a flight plan uplink is done
         */
    onUplinkDone() {
        this.fmService.fmgc.data.cpnyFplnUplinkInProgress.set(false);
        this.fmService.fmgc.data.cpnyFplnAvailable.set(true);
        this.showFmsErrorMessageFreeText({ message: 'UPLINK F-PLN AVAILABLE FOR INSERT.', backgroundColor: 'none', cleared: false, onClearOverride: () => {}, isResolvedOverride: () => {} });
    }

    /**
         * Calling this function with a message should display 1the message in the FMS' message area,
         * such as the scratchpad or a dedicated error line. The FMS error type given should be translated
         * into the appropriate message for the UI
         *
         * @param errorType the message to show
         */
    showFmsErrorMessage(errorType: FmsErrorType) {
        let messageStr: string = '';

        switch (errorType) {
        case FmsErrorType.EntryOutOfRange:
            messageStr = 'ENTRY OUT OF RANGE';
            break;
        case FmsErrorType.FormatError:
            messageStr = 'FORMAT ERROR';
            break;
        case FmsErrorType.NotInDatabase:
            messageStr = 'NOT IN DATABASE';
            break;
        case FmsErrorType.NotYetImplemented:
            messageStr = 'NOT YET IMPLEMENTED';
            break;

        default:
            break;
        }

        const msg: FmsErrorMessage = { message: messageStr, cleared: false, backgroundColor: 'none', onClearOverride: () => {}, isResolvedOverride: () => {} };
        const exists = this.fmsErrors.getArray().findIndex((el) => el.message === messageStr && el.cleared === true);
        if (exists !== -1) {
            this.fmsErrors.removeAt(exists);
        }
        this.fmsErrors.insert(msg, 0);
    }

    public showFmsErrorMessageFreeText(msg: FmsErrorMessage) {
        const exists = this.fmsErrors.getArray().findIndex((el) => el.message === msg.message && el.cleared === true);
        if (exists !== -1) {
            this.fmsErrors.removeAt(exists);
        }
        this.fmsErrors.insert(msg, 0);
    }

    public clearLatestFmsErrorMessage() {
        const arr = this.fmsErrors.getArray().concat([]);
        const index = arr.findIndex((val) => val.cleared === false);

        if (index > -1) {
            const old = arr[index];
            old.cleared = true;

            this.fmsErrors.set(arr);
        }
    }

    public updateFmsErrorMessages() {
        // TODO go through all messages, check if conditions still apply
    }

    public openMessageList() {
        this.messageListOpened.set(true);
    }

    /**
         * Calling this function with an array of items should display a UI allowing the user to
         * select the right item from a list of duplicates, and return the one chosen by the user or
         * `undefined` if the operation is cancelled.
         *
         * @param items the items to de-duplicate
         *
         * @returns the chosen item
         */
    async deduplicateFacilities<T extends DatabaseItem<any>>(items: T[]): Promise<T | undefined> {
        if (items.length > 1) {
            this.duplicateNamesOpened.set(true);
            const result = await this.duplicateNamesRef.instance.deduplicateFacilities(items);
            this.duplicateNamesOpened.set(false);

            return result;
        }
        return items[0];
    }

    /**
         * Calling this function should show a UI allowing the pilot to create a new waypoint with the ident
         * provided
         *
         * @param ident the identifier the waypoint should have
         *
         * @returns the created waypoint, or `undefined` if the operation is cancelled
         */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async createNewWaypoint(ident: string): Promise<Waypoint | undefined> {
        // TODO navigate to DATA/NAVAID --> PILOT STORED NAVAIDS --> NEW NAVAID
        return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    createLatLonWaypoint(coordinates: Coordinates, stored: boolean): Waypoint {
        const newWpt = WaypointFactory.fromLocation(
            `${coordinates.lat > 0 ? 'N' : 'S'}${coordinates.lat.toFixed(0).padStart(2, '0')}${coordinates.long > 0 ? 'E' : 'W'}${coordinates.long.toFixed(0).padStart(3, '0')}`,
            coordinates,
        );
        this.fmService.latLongStoredWaypoints.push(newWpt);

        return newWpt;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    createPlaceBearingPlaceBearingWaypoint(place1: Waypoint, bearing1: DegreesTrue, place2: Waypoint, bearing2: DegreesTrue, stored: boolean): Waypoint {
        const newWpt = WaypointFactory.fromPlaceBearingPlaceBearing(
            `PBX${(this.fmService.latLongStoredWaypoints.length + 1).toString().padStart(2, '0')}`,
            place1.location,
            bearing1,
            place2.location,
            bearing2,
        );
        this.fmService.latLongStoredWaypoints.push(newWpt);

        return newWpt;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    createPlaceBearingDistWaypoint(place: Waypoint, bearing: DegreesTrue, distance: NauticalMiles, stored: boolean): Waypoint {
        const newWpt = WaypointFactory.fromPlaceBearingDistance(`PBD${(this.fmService.latLongStoredWaypoints.length + 1).toString().padStart(2, '0')}`, place.location, bearing, distance);
        this.fmService.latLongStoredWaypoints.push(newWpt);

        return newWpt;
    }

    /**
     * This method is called by the FlightPhaseManager after a flight phase change
     * This method initializes AP States, initiates CDUPerformancePage changes and other set other required states
     * @param prevPhase {FmgcFlightPhases} Previous FmgcFlightPhase
     * @param nextPhase {FmgcFlightPhases} New FmgcFlightPhase
     */
    onFlightPhaseChanged(prevPhase: FmgcFlightPhase, nextPhase: FmgcFlightPhase) {
        // this.updateConstraints();
        // this.updateManagedSpeed();

        SimVar.SetSimVarValue('L:A32NX_CABIN_READY', 'Bool', 0);

        switch (nextPhase) {
        case FmgcFlightPhase.Takeoff: {
            this.destDataChecked = false;

            const plan = this.flightPlanService.active;

            if (plan.performanceData.accelerationAltitude.get() === undefined) {
                // it's important to set this immediately as we don't want to immediately sequence to the climb phase
                plan.performanceData.pilotAccelerationAltitude.set(SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet') + parseInt(NXDataStore.get('CONFIG_ACCEL_ALT', '1500')));
                // this.updateThrustReductionAcceleration();
            }
            if (plan.performanceData.engineOutAccelerationAltitude.get() === undefined) {
                // it's important to set this immediately as we don't want to immediately sequence to the climb phase
                plan.performanceData.pilotEngineOutAccelerationAltitude.set(SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet') + parseInt(NXDataStore.get('CONFIG_ACCEL_ALT', '1500')));
                // this.updateThrustReductionAcceleration();
            }

            /** Arm preselected speed/mach for next flight phase */
            this.fmgc.updatePreSelSpeedMach(this.fmgc.data.climbPreSelSpeed.get());

            break;
        }

        case FmgcFlightPhase.Climb: {
            this.destDataChecked = false;

            /** Activate pre selected speed/mach */
            if (prevPhase === FmgcFlightPhase.Takeoff) {
                this.fmgc.activatePreSelSpeedMach(this.fmgc.data.climbPreSelSpeed.get());
            }

            /** Arm preselected speed/mach for next flight phase */
            this.fmgc.updatePreSelSpeedMach(this.fmgc.data.cruisePreSelMach.get() ?? this.fmgc.data.cruisePreSelSpeed.get());

            if (!this.flightPlanService.active.performanceData.cruiseFlightLevel.get()) {
                this.flightPlanService.active.performanceData.cruiseFlightLevel.set(Simplane.getAutoPilotDisplayedAltitudeLockValue('feet') / 100);
            }

            break;
        }

        case FmgcFlightPhase.Cruise: {
            SimVar.SetSimVarValue('L:A32NX_GOAROUND_PASSED', 'bool', 0);
            Coherent.call('GENERAL_ENG_THROTTLE_MANAGED_MODE_SET', ThrottleMode.AUTO).catch(console.error).catch(console.error);

            /** Activate pre selected speed/mach */
            if (prevPhase === FmgcFlightPhase.Climb) {
                this.fmgc.activatePreSelSpeedMach(this.fmgc.data.cruisePreSelMach.get() ?? this.fmgc.data.cruisePreSelSpeed.get());
            }

            /** Arm preselected speed/mach for next flight phase */
            this.fmgc.updatePreSelSpeedMach(this.fmgc.data.descentPreSelSpeed.get());

            // This checks against the pilot defined cruise altitude and the automatically populated cruise altitude
            if (this.flightPlanService.active.performanceData.cruiseFlightLevel.get() !== SimVar.GetGameVarValue('AIRCRAFT CRUISE ALTITUDE', 'feet')) {
                SimVar.SetGameVarValue('AIRCRAFT CRUISE ALTITUDE', 'feet', this.flightPlanService.active.performanceData.cruiseFlightLevel.get());
                // this.addMessageToQueue(NXSystemMessages.newCrzAlt.getModifiedMessage(this._cruiseFlightLevel * 100));
            }

            break;
        }

        case FmgcFlightPhase.Descent: {
            this.checkDestData();

            Coherent.call('GENERAL_ENG_THROTTLE_MANAGED_MODE_SET', ThrottleMode.AUTO).catch(console.error).catch(console.error);

            /** Activate pre selected speed/mach */
            if (prevPhase === FmgcFlightPhase.Cruise) {
                this.fmgc.activatePreSelSpeedMach(this.fmgc.data.descentPreSelSpeed.get());
            }

            /** Clear pre selected speed/mach */
            this.fmgc.updatePreSelSpeedMach(undefined);

            this.flightPlanService.active.performanceData.cruiseFlightLevel.set(undefined);

            break;
        }

        case FmgcFlightPhase.Approach: {
            Coherent.call('GENERAL_ENG_THROTTLE_MANAGED_MODE_SET', ThrottleMode.AUTO).catch(console.error);
            SimVar.SetSimVarValue('L:A32NX_GOAROUND_PASSED', 'bool', 0);

            this.checkDestData();

            break;
        }

        case FmgcFlightPhase.GoAround: {
            SimVar.SetSimVarValue('L:A32NX_GOAROUND_GATRK_MODE', 'bool', 0);
            SimVar.SetSimVarValue('L:A32NX_GOAROUND_HDG_MODE', 'bool', 0);
            SimVar.SetSimVarValue('L:A32NX_GOAROUND_NAV_MODE', 'bool', 0);
            SimVar.SetSimVarValue('L:A32NX_GOAROUND_INIT_SPEED', 'number', Simplane.getIndicatedSpeed());
            SimVar.SetSimVarValue('L:A32NX_GOAROUND_INIT_APP_SPEED', 'number', this.fmgc.getApproachSpeed());
            // delete override logic when we have valid nav data -aka goaround path- after goaround!
            SimVar.SetSimVarValue('L:A32NX_GOAROUND_NAV_OVERRIDE', 'bool', 0);

            if (SimVar.GetSimVarValue('AUTOPILOT MASTER', 'Bool') === 1) {
                SimVar.SetSimVarValue('K:AP_LOC_HOLD_ON', 'number', 1); // Turns AP localizer hold !!ON/ARMED!! and glide-slope hold mode !!OFF!!
                SimVar.SetSimVarValue('K:AP_LOC_HOLD_OFF', 'number', 1); // Turns !!OFF!! localizer hold mode
                SimVar.SetSimVarValue('K:AUTOPILOT_OFF', 'number', 1);
                SimVar.SetSimVarValue('K:AUTOPILOT_ON', 'number', 1);
                SimVar.SetSimVarValue('L:A32NX_AUTOPILOT_APPR_MODE', 'bool', 0);
                SimVar.SetSimVarValue('L:A32NX_AUTOPILOT_LOC_MODE', 'bool', 0);
            } else if (SimVar.GetSimVarValue('AUTOPILOT MASTER', 'Bool') === 0 && SimVar.GetSimVarValue('AUTOPILOT APPROACH HOLD', 'boolean') === 1) {
                SimVar.SetSimVarValue('AP_APR_HOLD_OFF', 'number', 1);
                SimVar.SetSimVarValue('L:A32NX_AUTOPILOT_APPR_MODE', 'bool', 0);
                SimVar.SetSimVarValue('L:A32NX_AUTOPILOT_LOC_MODE', 'bool', 0);
            }

            const currentHeading = Simplane.getHeadingMagnetic();
            Coherent.call('HEADING_BUG_SET', 1, currentHeading).catch(console.error);

            const activePlan = this.flightPlanService.active;

            if (activePlan.performanceData.missedAccelerationAltitude.get() === undefined) {
                // it's important to set this immediately as we don't want to immediately sequence to the climb phase
                activePlan.performanceData.pilotMissedAccelerationAltitude.set(
                    SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet') + parseInt(NXDataStore.get('CONFIG_ENG_OUT_ACCEL_ALT', '1500')),
                );
                // this.updateThrustReductionAcceleration();
            }
            if (activePlan.performanceData.missedEngineOutAccelerationAltitude.get() === undefined) {
                // it's important to set this immediately as we don't want to immediately sequence to the climb phase
                activePlan.performanceData.pilotMissedEngineOutAccelerationAltitude.set(
                    SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet') + parseInt(NXDataStore.get('CONFIG_ENG_OUT_ACCEL_ALT', '1500')),
                );
                // this.updateThrustReductionAcceleration();
            }

            break;
        }

        case FmgcFlightPhase.Done:
            this.uiService.navigateTo('fms/data/status');

            this.flightPlanService.reset().then(() => {
                this.init();
                this.fmService.deleteAllStoredWaypoints();
                this.clearLatestFmsErrorMessage();
                SimVar.SetSimVarValue('L:A32NX_COLD_AND_DARK_SPAWN', 'Bool', true).then(() => {
                    this.uiService.navigateTo('fms/data/status');
                });
            }).catch(console.error);
            break;

        default:
            break;
        }
    }

    checkDestData() {
        this.showFmsErrorMessageFreeText({
            backgroundColor: 'amber',
            cleared: false,
            message: 'CHECK DEST DATA',
            isResolvedOverride: () => (Number.isFinite(this.fmgc.getApproachQnh())
                && Number.isFinite(this.fmgc.getApproachTemperature())
                && Number.isFinite(this.fmgc.getApproachWind().direction)
                && Number.isFinite(this.fmgc.getApproachWind().speed)),
            onClearOverride: () => {},
        });
    }

    public async onAfterRender(node: VNode): Promise<void> {
        super.onAfterRender(node);

        await this.initializeFlightPlans();
        this.navaidTuner.init();
        this.efisSymbols.init();
        this.flightPhaseManager.init();
        this.guidanceController.init();

        let lastUpdateTime = Date.now();

        this.init();

        setInterval(() => {
            const now = Date.now();
            const dt = now - lastUpdateTime;

            this.navaidSelectionManager.update(dt);
            this.landingSystemSelectionManager.update(dt);
            this.navaidTuner.update(dt);
            this.efisSymbols.update(dt);
            this.flightPhaseManager.shouldActivateNextPhase(dt);
            this.guidanceController.update(dt);
            this.fmgc.updateFromSimVars();

            lastUpdateTime = now;
        }, 100);

        const isCaptainSide = getDisplayIndex() === 2;

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
                    callsign={this.fmgc.data.atcCallsign}
                    activeFmsSource={this.activeFmsSource}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;
        case 'atccom':
            this.activeHeader = (
                <AtccomHeader
                    bus={this.props.bus}
                    callsign={this.fmgc.data.atcCallsign}
                    activeFmsSource={this.activeFmsSource}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;
        case 'surv':
            this.activeHeader = (
                <SurvHeader
                    bus={this.props.bus}
                    callsign={this.fmgc.data.atcCallsign}
                    activeFmsSource={this.activeFmsSource}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;
        case 'fcubkup':
            this.activeHeader = (
                <FcuBkupHeader
                    bus={this.props.bus}
                    callsign={this.fmgc.data.atcCallsign}
                    activeFmsSource={this.activeFmsSource}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;

        default:
            this.activeHeader = (
                <FmsHeader
                    bus={this.props.bus}
                    callsign={this.fmgc.data.atcCallsign}
                    activeFmsSource={this.activeFmsSource}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;
        }

        // Mapping from URL to page component
        switch (`${uri.sys}/${uri.category}/${uri.page}`) {
        case 'fms/active/perf':
        case 'fms/sec1/perf':
        case 'fms/sec2/perf':
        case 'fms/sec3/perf':
            this.activePage = (
                <MfdFmsPerf
                    pageTitle="PERF"
                    bus={this.props.bus}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;
        case 'fms/active/init':
        case 'fms/sec1/init':
        case 'fms/sec2/init':
        case 'fms/sec3/init':
            this.activePage = (
                <MfdFmsInit
                    pageTitle="INIT"
                    bus={this.props.bus}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;
        case 'fms/active/fuel-load':
        case 'fms/sec1/fuel-load':
        case 'fms/sec2/fuel-load':
        case 'fms/sec3/fuel-load':
            this.activePage = (
                <MfdFmsFuelLoad
                    pageTitle="FUEL&LOAD"
                    bus={this.props.bus}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;
        case 'fms/active/f-pln':
        case 'fms/sec1/f-pln':
        case 'fms/sec2/f-pln':
        case 'fms/sec3/f-pln':
            this.activePage = (
                <MfdFmsFpln
                    pageTitle="F-PLN"
                    bus={this.props.bus}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;
        case 'fms/active/f-pln-airways':
        case 'fms/sec1/f-pln-airways':
        case 'fms/sec2/f-pln-airways':
        case 'fms/sec3/f-pln-airways':
            this.activePage = (
                <MfdFmsFplnAirways
                    pageTitle="F-PLN/AIRWAYS"
                    bus={this.props.bus}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;
        case 'fms/active/f-pln-departure':
        case 'fms/sec1/f-pln-departure':
        case 'fms/sec2/f-pln-departure':
        case 'fms/sec3/f-pln-departure':
            this.activePage = (
                <MfdFmsFplnDep
                    pageTitle="F-PLN/DEPARTURE"
                    bus={this.props.bus}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;
        case 'fms/active/f-pln-arrival':
        case 'fms/sec1/f-pln-arrival':
        case 'fms/sec2/f-pln-arrival':
        case 'fms/sec3/f-pln-arrival':
            this.activePage = (
                <MfdFmsFplnArr
                    pageTitle="F-PLN/ARRIVAL"
                    bus={this.props.bus}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;
        case 'fms/active/f-pln-direct-to':
        case 'fms/sec1/f-pln-direct-to':
        case 'fms/sec2/f-pln-direct-to':
        case 'fms/sec3/f-pln-direct-to':
            this.activePage = (
                <MfdFmsFplnDirectTo
                    pageTitle="F-PLN/DIRECT-TO"
                    bus={this.props.bus}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;
        case 'fms/position/irs':
            this.activePage = (
                <MfdFmsPositionIrs
                    pageTitle="IRS"
                    bus={this.props.bus}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;

        default:
            this.activePage = (
                <MfdNotFound
                    pageTitle="NOT FOUND"
                    bus={this.props.bus}
                    uiService={this.uiService}
                    fmService={this.fmService}
                />
            );
            break;
        }

        FSComponent.render(this.activeHeader, this.activeHeaderRef.getOrDefault());
        FSComponent.render(this.activePage, this.activePageRef?.getOrDefault());
    }

    render(): VNode {
        return (
            <DisplayUnit bus={this.props.bus} normDmc={1} brightness={this.displayBrightness} powered={this.displayPowered}>
                <div class="mfd-main" ref={this.topRef}>
                    <div ref={this.activeHeaderRef} />
                    <MfdMsgList
                        visible={this.messageListOpened}
                        messages={this.fmsErrors}
                        bus={this.props.bus}
                        uiService={this.uiService}
                        fmService={this.fmService}
                    />
                    <MfdFmsFplnDuplicateNames
                        ref={this.duplicateNamesRef}
                        visible={this.duplicateNamesOpened}
                        bus={this.props.bus}
                        uiService={this.uiService}
                        fmService={this.fmService}
                    />
                    <div ref={this.activePageRef} class="mfd-navigator-container" />
                    <MouseCursor side={Subject.create('CPT')} ref={this.mouseCursorRef} />
                </div>
            </DisplayUnit>
        );
    }
}