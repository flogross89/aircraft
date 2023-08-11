// Copyright (c) 2021-2023 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { GenericDataListenerSync, MathUtils } from '@flybywiresim/fbw-sdk';
import { EfisOption, EfisNdMode, NdSymbol, NdSymbolTypeFlags, rangeSettings, EfisNdRangeValue } from '@shared/NavigationDisplay';
import { Coordinates } from '@fmgc/flightplanning/data/geo';
import { Geometry } from '@fmgc/guidance/Geometry';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { bearingTo, distanceTo } from 'msfs-geo';
import { LnavConfig } from '@fmgc/guidance/LnavConfig';
import { Airport, AltitudeDescriptor, LegType, Runway, RunwaySurfaceType, VhfNavaidType, WaypointDescriptor } from 'msfs-navdata';
import { SegmentClass } from '@fmgc/flightplanning/new/segments/SegmentClass';
import { NavigationDatabase } from '@fmgc/NavigationDatabase';
import { FlightPlan } from '@fmgc/flightplanning/new/plans/FlightPlan';
import { FlightPlanIndex } from '@fmgc/flightplanning/new/FlightPlanManager';
import { BaseFlightPlan } from '@fmgc/flightplanning/new/plans/BaseFlightPlan';
import { AlternateFlightPlan } from '@fmgc/flightplanning/new/plans/AlternateFlightPlan';
import { NearbyFacilities } from '@fmgc/navigation/NearbyFacilities';
import { NavaidTuner } from '@fmgc/navigation/NavaidTuner';
import { getFlightPhaseManager } from '@fmgc/flightphase';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FlightPlanLeg } from '@fmgc/flightplanning/new/legs/FlightPlanLeg';
import { WaypointConstraintType } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanService } from '@fmgc/flightplanning/new/FlightPlanService';

const VALID_ALTITUDE_CONSTRAINT_TYPES_FOR_EFIS = [
    AltitudeDescriptor.AtAlt1,
    AltitudeDescriptor.AtOrAboveAlt1,
    AltitudeDescriptor.AtOrBelowAlt1,
    AltitudeDescriptor.BetweenAlt1Alt2,
    AltitudeDescriptor.AtOrAboveAlt2,
];

export class EfisSymbols {
    private blockUpdate = false;

    private guidanceController: GuidanceController;

    private nearby: NearbyFacilities;

    private syncer: GenericDataListenerSync = new GenericDataListenerSync();

    private static sides = ['L', 'R'];

    private lastMode = { L: -1, R: -1 };

    private lastRange = { L: 0, R: 0 };

    private lastEfisOption = { L: 0, R: 0 };

    private lastPlanCentre = undefined;

    private lastPpos: Coordinates = { lat: 0, long: 0 };

    private lastTrueHeading: number = -1;

    private lastNearbyFacilitiesVersion;

    private lastFpVersions: Record<number, number> = {};

    private lastNavaidVersion = -1;

    private lastVnavDriverVersion: number = -1;

    constructor(guidanceController: GuidanceController, private readonly flightPlanService: FlightPlanService, private readonly navaidTuner: NavaidTuner) {
        this.guidanceController = guidanceController;
        this.nearby = NearbyFacilities.getInstance();
    }

    init(): void {
        this.nearby.init();
    }

    async update(deltaTime: number): Promise<void> {
        this.nearby.update(deltaTime);

        if (this.blockUpdate) {
            return;
        }

        // TODO use FMGC position
        const ppos = {
            lat: SimVar.GetSimVarValue('PLANE LATITUDE', 'degree latitude'),
            long: SimVar.GetSimVarValue('PLANE LONGITUDE', 'degree longitude'),
        };
        const trueHeading = SimVar.GetSimVarValue('PLANE HEADING DEGREES TRUE', 'degrees');

        // TODO planar distance in msfs-geo
        const pposChanged = distanceTo(this.lastPpos, ppos) > 2;
        if (pposChanged) {
            this.lastPpos = ppos;
        }
        const trueHeadingChanged = MathUtils.diffAngle(trueHeading, this.lastTrueHeading) > 2;
        if (trueHeadingChanged) {
            this.lastTrueHeading = trueHeading;
        }

        const nearbyFacilitiesChanged = this.nearby.version !== this.lastNearbyFacilitiesVersion;
        this.lastNearbyFacilitiesVersion = this.nearby.version;

        const activeFPVersionChanged = this.flightPlanService.has(FlightPlanIndex.Active)
            && this.lastFpVersions[FlightPlanIndex.Active] !== this.flightPlanService.active.version;
        const tempFPVersionChanged = this.flightPlanService.has(FlightPlanIndex.Temporary)
            && this.lastFpVersions[FlightPlanIndex.Temporary] !== this.flightPlanService.temporary.version;
        const secFPVersionChanged = this.flightPlanService.has(FlightPlanIndex.FirstSecondary)
            && this.lastFpVersions[FlightPlanIndex.FirstSecondary] !== this.flightPlanService.secondary(1).version;

        const fpChanged = activeFPVersionChanged || tempFPVersionChanged || secFPVersionChanged;

        if (this.flightPlanService.has(FlightPlanIndex.Active)) {
            this.lastFpVersions[FlightPlanIndex.Active] = this.flightPlanService.active.version;
        }

        if (this.flightPlanService.has(FlightPlanIndex.Temporary)) {
            this.lastFpVersions[FlightPlanIndex.Temporary] = this.flightPlanService.temporary.version;
        }

        if (this.flightPlanService.has(FlightPlanIndex.FirstSecondary)) {
            this.lastFpVersions[FlightPlanIndex.FirstSecondary] = this.flightPlanService.secondary(1).version;
        }

        // FIXME map reference point should be per side
        const planCentreFpIndex = SimVar.GetSimVarValue('L:A32NX_SELECTED_WAYPOINT_FP_INDEX', 'number');
        const planCentreIndex = SimVar.GetSimVarValue('L:A32NX_SELECTED_WAYPOINT_INDEX', 'number');
        const planCentreInAlternate = SimVar.GetSimVarValue('L:A32NX_SELECTED_WAYPOINT_IN_ALTERNATE', 'Bool');

        // FIXME can't have these early returns as it breaks non-fpln stuff
        if (!this.flightPlanService.has(planCentreFpIndex)) {
            return;
        }

        const plan = planCentreInAlternate ? this.flightPlanService.get(planCentreFpIndex).alternateFlightPlan : this.flightPlanService.get(planCentreFpIndex);

        // FIXME as above
        if (!plan.hasElement(planCentreIndex)) {
            return;
        }

        let planCentre = plan.elementAt(planCentreIndex);

        if (planCentre?.isDiscontinuity === true) {
            planCentre = plan.elementAt(Math.max(0, (planCentreIndex - 1)));
        }

        if (planCentre?.isDiscontinuity === true) {
            throw new Error('bruh');
        }

        const termination = planCentre?.terminationWaypoint()?.location;

        if (termination) {
            this.lastPlanCentre = termination;
        }

        const planCentreChanged = termination?.lat !== this.lastPlanCentre?.lat || termination?.long !== this.lastPlanCentre?.long;

        const navaidsChanged = this.lastNavaidVersion !== this.navaidTuner.navaidVersion;
        this.lastNavaidVersion = this.navaidTuner.navaidVersion;

        const vnavPredictionsChanged = this.lastVnavDriverVersion !== this.guidanceController.vnavDriver.version;
        this.lastVnavDriverVersion = this.guidanceController.vnavDriver.version;

        const hasSuitableRunway = (airport: Airport): boolean => airport.longestRunwayLength >= 1500 && airport.longestRunwaySurfaceType === RunwaySurfaceType.Hard;

        for (const side of EfisSymbols.sides) {
            const range = rangeSettings[SimVar.GetSimVarValue(`L:A32NX_EFIS_${side}_ND_RANGE`, 'number')];
            const mode: EfisNdMode = SimVar.GetSimVarValue(`L:A32NX_EFIS_${side}_ND_MODE`, 'number');
            const efisOption = SimVar.GetSimVarValue(`L:A32NX_EFIS_${side}_OPTION`, 'Enum');

            const rangeChange = this.lastRange[side] !== range;
            this.lastRange[side] = range;
            const modeChange = this.lastMode[side] !== mode;
            this.lastMode[side] = mode;
            const efisOptionChange = this.lastEfisOption[side] !== efisOption;
            this.lastEfisOption[side] = efisOption;
            const nearbyOverlayChanged = efisOption !== EfisOption.Constraints && efisOption !== EfisOption.None && nearbyFacilitiesChanged;

            if (!pposChanged
                && !trueHeadingChanged
                && !rangeChange
                && !modeChange
                && !efisOptionChange
                && !nearbyOverlayChanged
                && !fpChanged
                && !planCentreChanged
                && !navaidsChanged
                && !vnavPredictionsChanged
            ) {
                continue;
            }

            if (mode === EfisNdMode.PLAN && !planCentre) {
                this.syncer.sendEvent(`A32NX_EFIS_${side}_SYMBOLS`, []);
                return;
            }

            const [editAhead, editBehind, editBeside] = this.calculateEditArea(range, mode);

            // eslint-disable-next-line no-loop-func
            const withinEditArea = (ll): boolean => {
                // FIXME
                if (!termination) {
                    return true;
                }

                const dist = distanceTo(mode === EfisNdMode.PLAN ? termination : ppos, ll);
                let bearing = bearingTo(mode === EfisNdMode.PLAN ? termination : ppos, ll);
                if (mode !== EfisNdMode.PLAN) {
                    bearing = MathUtils.clampAngle(bearing - trueHeading);
                }
                bearing = bearing * Math.PI / 180;
                const dx = dist * Math.sin(bearing);
                const dy = dist * Math.cos(bearing);
                return Math.abs(dx) < editBeside && dy > -editBehind && dy < editAhead;
            };

            const symbols: NdSymbol[] = [];

            // symbols most recently inserted always end up at the end of the array
            // we reverse the array at the end to make sure symbols are drawn in the correct order
            // eslint-disable-next-line no-loop-func
            const upsertSymbol = (symbol: NdSymbol): void => {
                if (DEBUG) {
                    console.time(`upsert symbol ${symbol.databaseId}`);
                }
                const symbolIdx = symbols.findIndex((s) => s.databaseId === symbol.databaseId);
                if (symbolIdx !== -1) {
                    const oldSymbol = symbols.splice(symbolIdx, 1)[0];
                    symbol.constraints = symbol.constraints ?? oldSymbol.constraints;
                    symbol.direction = symbol.direction ?? oldSymbol.direction;
                    symbol.length = symbol.length ?? oldSymbol.length;
                    symbol.location = symbol.location ?? oldSymbol.location;
                    symbol.type |= oldSymbol.type;
                    if (oldSymbol.radials) {
                        if (symbol.radials) {
                            symbol.radials.push(...oldSymbol.radials);
                        } else {
                            symbol.radials = oldSymbol.radials;
                        }
                    }
                    if (oldSymbol.radii) {
                        if (symbol.radii) {
                            symbol.radii.push(...oldSymbol.radii);
                        } else {
                            symbol.radii = oldSymbol.radii;
                        }
                    }
                }
                symbols.push(symbol);
            };

            // TODO ADIRs aligned (except in plan mode...?)
            if (efisOption === EfisOption.VorDmes) {
                for (const vor of this.nearby.getVhfNavaids()) {
                    const symbolType = this.vorDmeTypeFlag(vor.type);
                    if (symbolType === 0) {
                        continue;
                    }
                    if (withinEditArea(vor.location)) {
                        upsertSymbol({
                            databaseId: vor.databaseId,
                            ident: vor.ident,
                            location: vor.location,
                            type: this.vorDmeTypeFlag(vor.type) | NdSymbolTypeFlags.EfisOption,
                        });
                    }
                }
            } else if (efisOption === EfisOption.Ndbs) {
                for (const ndb of this.nearby.getNdbNavaids()) {
                    if (withinEditArea(ndb.location)) {
                        upsertSymbol({
                            databaseId: ndb.databaseId,
                            ident: ndb.ident,
                            location: ndb.location,
                            type: NdSymbolTypeFlags.Ndb | NdSymbolTypeFlags.EfisOption,
                        });
                    }
                }
            } else if (efisOption === EfisOption.Airports) {
                for (const ap of this.nearby.getAirports()) {
                    if (withinEditArea(ap.location) && hasSuitableRunway(ap)) {
                        upsertSymbol({
                            databaseId: ap.databaseId,
                            ident: ap.ident,
                            location: ap.location,
                            type: NdSymbolTypeFlags.Airport | NdSymbolTypeFlags.EfisOption,
                        });
                    }
                }
            } else if (efisOption === EfisOption.Waypoints) {
                for (const wp of this.nearby.getWaypoints()) {
                    if (withinEditArea(wp.location)) {
                        upsertSymbol({
                            databaseId: wp.databaseId,
                            ident: wp.ident,
                            location: wp.location,
                            type: NdSymbolTypeFlags.Waypoint | NdSymbolTypeFlags.EfisOption,
                        });
                    }
                }
            }

            const formatConstraintAlt = (alt: number, descent: boolean, prefix: string = '') => {
                // const transAlt = activeFp?.originTransitionAltitudePilot ?? activeFp?.originTransitionAltitudeDb;
                // const transFl = activeFp?.destinationTransitionLevelPilot ?? activeFp?.destinationTransitionLevelDb;
                const transAlt = 18_000;
                const transFl = 180;

                if (descent) {
                    const fl = Math.round(alt / 100);
                    if (transFl && fl >= transFl) {
                        return `${prefix}FL${fl}`;
                    }
                } else if (transAlt && alt >= transAlt) {
                    return `${prefix}FL${Math.round(alt / 100)}`;
                }
                return `${prefix}${Math.round(alt)}`;
            };

            const formatConstraintSpeed = (speed: number, prefix: string = '') => `${prefix}${Math.floor(speed)}KT`;

            // TODO don't send the waypoint before active once FP sequencing is properly implemented
            // (currently sequences with guidance which is too early)
            // eslint-disable-next-line no-lone-blocks

            // ALTN
            if (this.flightPlanService.hasActive) {
                const symbols = this.getFlightPlanSymbols(
                    true,
                    this.flightPlanService.active,
                    this.guidanceController.activeGeometry,
                    range,
                    efisOption,
                    () => true,
                    formatConstraintAlt,
                    formatConstraintSpeed,
                );

                for (const symbol of symbols) {
                    upsertSymbol(symbol);
                }

                // ACTIVE ALTN
                if (this.flightPlanService.active.alternateFlightPlan.legCount > 0) {
                    const symbols = this.getFlightPlanSymbols(
                        true,
                        this.flightPlanService.active.alternateFlightPlan,
                        this.guidanceController.getGeometryForFlightPlan(FlightPlanIndex.Active, true),
                        range,
                        efisOption,
                        () => true,
                        formatConstraintAlt,
                        formatConstraintSpeed,
                    );

                    for (const symbol of symbols) {
                        upsertSymbol(symbol);
                    }
                }
            }

            // TMPY
            if (this.flightPlanService.hasTemporary) {
                const symbols = this.getFlightPlanSymbols(
                    true,
                    this.flightPlanService.temporary,
                    this.guidanceController.temporaryGeometry,
                    range,
                    efisOption,
                    () => true,
                    formatConstraintAlt,
                    formatConstraintSpeed,
                );

                for (const symbol of symbols) {
                    upsertSymbol(symbol);
                }
            }

            // SEC
            if (this.flightPlanService.hasSecondary(1)) {
                const symbols = this.getFlightPlanSymbols(
                    false,
                    this.flightPlanService.secondary(1),
                    this.guidanceController.secondaryGeometry,
                    range,
                    efisOption,
                    () => true,
                    formatConstraintAlt,
                    formatConstraintSpeed,
                );

                for (const symbol of symbols) {
                    upsertSymbol(symbol);
                }

                // SEC ALTN
                if (this.flightPlanService.secondary((1)).alternateFlightPlan.legCount > 0) {
                    const symbols = this.getFlightPlanSymbols(
                        true,
                        this.flightPlanService.secondary(1).alternateFlightPlan,
                        this.guidanceController.getGeometryForFlightPlan(FlightPlanIndex.FirstSecondary, true),
                        range,
                        efisOption,
                        () => true,
                        formatConstraintAlt,
                        formatConstraintSpeed,
                    );

                    for (const symbol of symbols) {
                        upsertSymbol(symbol);
                    }
                }
            }

            // Pseudo waypoints

            for (const pwp of this.guidanceController.currentPseudoWaypoints.filter((it) => it && it.displayedOnNd)) {
                upsertSymbol({
                    databaseId: `W      ${pwp.ident}`,
                    ident: pwp.ident,
                    location: pwp.efisSymbolLla,
                    type: pwp.efisSymbolFlag,
                });
            }

            for (const ndb of this.navaidTuner.tunedNdbs) {
                upsertSymbol({
                    databaseId: ndb.databaseId,
                    ident: ndb.ident,
                    location: ndb.location,
                    type: NdSymbolTypeFlags.Ndb | NdSymbolTypeFlags.Tuned,
                });
            }

            for (const vor of this.navaidTuner.tunedVors) {
                upsertSymbol({
                    databaseId: vor.databaseId,
                    ident: vor.ident,
                    location: vor.location,
                    type: this.vorDmeTypeFlag(vor.type) | NdSymbolTypeFlags.Tuned,
                });
            }

            const wordsPerSymbol = 6;
            const maxSymbols = 640 / wordsPerSymbol;
            if (symbols.length > maxSymbols) {
                symbols.splice(0, symbols.length - maxSymbols);
                this.guidanceController.efisStateForSide[side].dataLimitReached = true;
            } else {
                this.guidanceController.efisStateForSide[side].dataLimitReached = false;
            }

            this.syncer.sendEvent(`A32NX_EFIS_${side}_SYMBOLS`, symbols);

            // make sure we don't run too often
            this.blockUpdate = true;
            setTimeout(() => {
                this.blockUpdate = false;
            }, 200);
        }
    }

    private getFlightPlanSymbols(
        activeOrTemporary: boolean,
        flightPlan: BaseFlightPlan,
        geometry: Geometry,
        range: NauticalMiles,
        efisOption: EfisOption,
        withinEditArea: (ll) => boolean,
        formatConstraintAlt: (alt: number, descent: boolean, prefix?: string) => string,
        formatConstraintSpeed: (speed: number, prefix?: string) => string,
    ): NdSymbol[] {
        const isInLatAutoControl = this.guidanceController.vnavDriver.isLatAutoControlActive();
        const waypointPredictions = this.guidanceController.vnavDriver.mcduProfile?.waypointPredictions;
        const isSelectedVerticalModeActive = this.guidanceController.vnavDriver.isSelectedVerticalModeActive();
        const flightPhase = getFlightPhaseManager().phase;

        const planCentreFpIndex = SimVar.GetSimVarValue('L:A32NX_SELECTED_WAYPOINT_FP_INDEX', 'number');
        const planCentreIndex = SimVar.GetSimVarValue('L:A32NX_SELECTED_WAYPOINT_INDEX', 'number');

        const correctPlanOnMcdu = activeOrTemporary ? planCentreFpIndex === FlightPlanIndex.Active : planCentreFpIndex === flightPlan.index;
        const transmitMissed = correctPlanOnMcdu && flightPlan.firstMissedApproachLegIndex - planCentreIndex < 4;

        const ret: NdSymbol[] = [];

        // FP legs
        for (let i = flightPlan.legCount - 1; i >= (flightPlan.activeLegIndex - 1) && i >= 0; i--) {
            const isFromLeg = i === flightPlan.activeLegIndex - 1;

            const leg = flightPlan.elementAt(i);

            if (leg.isDiscontinuity === true) {
                continue;
            }

            if (leg.definition.waypointDescriptor === WaypointDescriptor.Airport || leg.definition.waypointDescriptor === WaypointDescriptor.Runway) {
                // we pick these up later
                continue;
            }

            // if range >= 160, don't include terminal waypoints, except at enroute boundary
            if (range >= 160) {
                const [segment] = flightPlan.segmentPositionForIndex(i);
                if (segment.class === SegmentClass.Departure || segment.class === SegmentClass.Arrival) {
                    continue;
                }
            }

            let location;
            let databaseId;

            const geometryLeg = geometry.legs.get(i);

            if (geometryLeg) {
                const terminationWaypoint = geometryLeg.terminationWaypoint;

                if (terminationWaypoint) {
                    if ('lat' in terminationWaypoint) {
                        location = terminationWaypoint;
                        databaseId = `X${Math.round(Math.random() * 1_000).toString().padStart(6, '0')}${leg.ident.substring(0, 5)}`;
                    } else {
                        location = terminationWaypoint.location;
                        databaseId = terminationWaypoint.databaseId;
                    }
                }
            }

            if (!location) {
                location = leg.terminationWaypoint()?.location;
                databaseId = leg.terminationWaypoint()?.databaseId;
            }

            if (!location) {
                continue;
            }

            if (!withinEditArea(location)) {
                continue;
            }

            let type = NdSymbolTypeFlags.FlightPlan;
            const constraints = [];
            let direction;

            const isCourseReversal = leg.type === LegType.HA
                || leg.type === LegType.HF
                || leg.type === LegType.HM
                || leg.type === LegType.PI;

            if (i === flightPlan.activeLegIndex) {
                type |= NdSymbolTypeFlags.ActiveLegTermination;
            } else if (isCourseReversal && i > (flightPlan.activeLegIndex + 1) && range <= 80 && !LnavConfig.DEBUG_FORCE_INCLUDE_COURSE_REVERSAL_VECTORS) {
                if (leg.definition.turnDirection === 'L') {
                    type |= NdSymbolTypeFlags.CourseReversalLeft;
                } else {
                    type |= NdSymbolTypeFlags.CourseReversalRight;
                }
                direction = leg.definition.magneticCourse; // TODO true
            }

            if (i >= flightPlan.firstMissedApproachLegIndex && !transmitMissed) {
                continue;
            }

            if (isInLatAutoControl && !isFromLeg && VALID_ALTITUDE_CONSTRAINT_TYPES_FOR_EFIS.includes(leg.definition.altitudeDescriptor)) {
                if (!isSelectedVerticalModeActive && shouldShowConstraintCircleInPhase(flightPhase, leg)) {
                    type |= NdSymbolTypeFlags.Constraint;

                    const predictionAtWaypoint = waypointPredictions.get(i);

                    if (predictionAtWaypoint?.isAltitudeConstraintMet) {
                        type |= NdSymbolTypeFlags.MagentaColor;
                    } else if (predictionAtWaypoint) {
                        type |= NdSymbolTypeFlags.AmberColor;
                    }
                } else if (i === flightPlan.activeLegIndex) {
                    type |= NdSymbolTypeFlags.Constraint;
                }
            }

            if (efisOption === EfisOption.Constraints) {
                const descent = leg.segment.class === SegmentClass.Arrival;
                switch (leg.definition.altitudeDescriptor) {
                case AltitudeDescriptor.AtAlt1:
                    constraints.push(formatConstraintAlt(leg.definition.altitude1, descent));
                    break;
                case AltitudeDescriptor.AtOrAboveAlt1:
                    constraints.push(formatConstraintAlt(leg.definition.altitude1, descent, '+'));
                    break;
                case AltitudeDescriptor.AtOrBelowAlt1:
                    constraints.push(formatConstraintAlt(leg.definition.altitude1, descent, '-'));
                    break;
                case AltitudeDescriptor.BetweenAlt1Alt2:
                    constraints.push(formatConstraintAlt(leg.definition.altitude1, descent, '-'));
                    constraints.push(formatConstraintAlt(leg.definition.altitude2, descent, '+'));
                    break;
                default:
                    // FIXME do the rest
                    break;
                }

                if (leg.definition.speed > 0) {
                    constraints.push(formatConstraintSpeed(leg.definition.speed));
                }
            }

            ret.push({
                databaseId,
                ident: leg.ident,
                location,
                type,
                constraints: constraints.length > 0 ? constraints : undefined,
                direction,
            });
        }

        // FP airports/runways

        const airports: [Airport | undefined, Runway | undefined][] = [
            [flightPlan.originAirport, flightPlan.originRunway],
            [flightPlan.destinationAirport, flightPlan.destinationRunway],
        ];

        for (const [airport, runway] of airports) {
            if (!airport) {
                continue;
            }

            const planAltnStr = flightPlan instanceof AlternateFlightPlan ? 'A' : ' ';
            const planIndexStr = flightPlan.index.toString();
            const runwayIdentStr = runway?.ident.replace('RW', '').padEnd(4, ' ') ?? '    ';

            const databaseId = `A${airport.ident}${(planAltnStr)}${planIndexStr}${runwayIdentStr}`;

            if (runway) {
                if (withinEditArea(runway.startLocation)) {
                    ret.push({
                        databaseId,
                        ident: NavigationDatabase.formatLongRunwayIdent(airport.ident, runway.ident),
                        location: runway.startLocation,
                        direction: runway.bearing,
                        length: runway.length / MathUtils.DIV_METRES_TO_NAUTICAL_MILES,
                        type: NdSymbolTypeFlags.Runway,
                    });
                }
            } else if (withinEditArea(airport.location)) {
                ret.push({
                    databaseId,
                    ident: airport.ident,
                    location: airport.location,
                    type: NdSymbolTypeFlags.Airport,
                });
            }
        }

        // FP fix info
        if (flightPlan instanceof FlightPlan) {
            for (let i = 0; i < 4; i++) {
                const fixInfo = flightPlan.fixInfos[i];

                if (!fixInfo) {
                    continue;
                }

                ret.push({
                    databaseId: fixInfo.fix.databaseId,
                    ident: fixInfo.fix.ident,
                    location: fixInfo.fix.location,
                    type: NdSymbolTypeFlags.FixInfo,
                    radials: fixInfo.radials.map((it) => it.trueBearing),
                    radii: fixInfo.radii.map((it) => it.radius),
                });
            }
        }

        return ret;
    }

    private vorDmeTypeFlag(type: VhfNavaidType): NdSymbolTypeFlags {
        switch (type) {
        case VhfNavaidType.VorDme:
        case VhfNavaidType.Vortac:
            return NdSymbolTypeFlags.VorDme;
        case VhfNavaidType.Vor:
            return NdSymbolTypeFlags.Vor;
        case VhfNavaidType.Dme:
        case VhfNavaidType.Tacan:
            return NdSymbolTypeFlags.Dme;
        default:
            return 0;
        }
    }

    private calculateEditArea(range: EfisNdRangeValue, mode: EfisNdMode): [number, number, number] {
        switch (mode) {
        case EfisNdMode.ARC:
            if (range <= 10) {
                return [10.5, 3.5, 8.3];
            }
            if (range <= 20) {
                return [20.5, 7, 16.6];
            }
            if (range <= 40) {
                return [40.5, 14, 33.2];
            }
            if (range <= 80) {
                return [80.5, 28, 66.4];
            }
            if (range <= 160) {
                return [160.5, 56, 132.8];
            }
            return [320.5, 112, 265.6];
        case EfisNdMode.ROSE_NAV:
            if (range <= 10) {
                return [7.6, 7.1, 7.1];
            }
            if (range <= 20) {
                return [14.7, 14.2, 14.2];
            }
            if (range <= 40) {
                return [28.9, 28.4, 28.4];
            }
            if (range <= 80) {
                return [57.3, 56.8, 56.8];
            }
            if (range <= 160) {
                return [114.1, 113.6, 113.6];
            }
            return [227.7, 227.2, 227.2];
        case EfisNdMode.PLAN:
            if (range <= 10) {
                return [7, 7, 7];
            }
            if (range <= 20) {
                return [14, 14, 14];
            }
            if (range <= 40) {
                return [28, 28, 28];
            }
            if (range <= 80) {
                return [56, 56, 56];
            }
            if (range <= 160) {
                return [112, 112, 112];
            }
            return [224, 224, 224];
        default:
            return [0, 0, 0];
        }
    }
}

const shouldShowConstraintCircleInPhase = (phase: FmgcFlightPhase, leg: FlightPlanLeg) => (
    (phase === FmgcFlightPhase.Takeoff || phase === FmgcFlightPhase.Climb) && leg.constraintType === WaypointConstraintType.CLB
) || (
    (phase === FmgcFlightPhase.Cruise || phase === FmgcFlightPhase.Descent || phase === FmgcFlightPhase.Approach) && leg.constraintType === WaypointConstraintType.DES
);