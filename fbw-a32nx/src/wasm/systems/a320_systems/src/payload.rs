use enum_map::{Enum, EnumMap};
use lazy_static::lazy_static;

use std::{cell::Cell, rc::Rc, time::Duration};

use uom::si::{f64::Mass, mass::kilogram};

use systems::{
    payload::{BoardingRate, Cargo, CargoInfo, Pax, PaxInfo},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

#[derive(Debug, Clone, Copy, Enum)]
pub enum A320Pax {
    A,
    B,
    C,
    D,
}
impl A320Pax {
    pub fn iterator() -> impl Iterator<Item = A320Pax> {
        [A320Pax::A, A320Pax::B, A320Pax::C, A320Pax::D]
            .iter()
            .copied()
    }
}

#[derive(Debug, Clone, Copy, Enum)]
pub enum A320Cargo {
    FwdBaggage,
    AftContainer,
    AftBaggage,
    AftBulkLoose,
}
impl A320Cargo {
    pub fn iterator() -> impl Iterator<Item = A320Cargo> {
        [
            A320Cargo::FwdBaggage,
            A320Cargo::AftContainer,
            A320Cargo::AftBaggage,
            A320Cargo::AftBulkLoose,
        ]
        .iter()
        .copied()
    }
}

lazy_static! {
    static ref A320_PAX: EnumMap<A320Pax, PaxInfo> = EnumMap::from_array([
        PaxInfo::new(36, "PAX_A", "PAYLOAD_STATION_1_REQ",),
        PaxInfo::new(42, "PAX_B", "PAYLOAD_STATION_2_REQ",),
        PaxInfo::new(48, "PAX_C", "PAYLOAD_STATION_3_REQ",),
        PaxInfo::new(48, "PAX_D", "PAYLOAD_STATION_4_REQ",)
    ]);
    static ref A320_CARGO: EnumMap<A320Cargo, CargoInfo> = EnumMap::from_array([
        CargoInfo::new(
            Mass::new::<kilogram>(3402.),
            "CARGO_FWD_BAGGAGE_CONTAINER",
            "PAYLOAD_STATION_5_REQ",
        ),
        CargoInfo::new(
            Mass::new::<kilogram>(2426.),
            "CARGO_AFT_CONTAINER",
            "PAYLOAD_STATION_6_REQ",
        ),
        CargoInfo::new(
            Mass::new::<kilogram>(2110.),
            "CARGO_AFT_BAGGAGE",
            "PAYLOAD_STATION_7_REQ",
        ),
        CargoInfo::new(
            Mass::new::<kilogram>(1497.),
            "CARGO_AFT_BULK_LOOSE",
            "PAYLOAD_STATION_8_REQ",
        )
    ]);
}

pub struct A320BoardingSounds {
    pax_board_id: VariableIdentifier,
    pax_deboard_id: VariableIdentifier,
    pax_complete_id: VariableIdentifier,
    pax_ambience_id: VariableIdentifier,
    pax_boarding: bool,
    pax_deboarding: bool,
    pax_complete: bool,
    pax_ambience: bool,
}
impl A320BoardingSounds {
    pub fn new(
        pax_board_id: VariableIdentifier,
        pax_deboard_id: VariableIdentifier,
        pax_complete_id: VariableIdentifier,
        pax_ambience_id: VariableIdentifier,
    ) -> Self {
        A320BoardingSounds {
            pax_board_id,
            pax_deboard_id,
            pax_complete_id,
            pax_ambience_id,
            pax_boarding: false,
            pax_deboarding: false,
            pax_complete: false,
            pax_ambience: false,
        }
    }

    fn start_pax_boarding(&mut self) {
        self.pax_boarding = true;
    }

    fn stop_pax_boarding(&mut self) {
        self.pax_boarding = false;
    }

    fn start_pax_deboarding(&mut self) {
        self.pax_deboarding = true;
    }

    fn stop_pax_deboarding(&mut self) {
        self.pax_deboarding = false;
    }

    fn start_pax_complete(&mut self) {
        self.pax_complete = true;
    }

    fn stop_pax_complete(&mut self) {
        self.pax_complete = false;
    }

    fn start_pax_ambience(&mut self) {
        self.pax_ambience = true;
    }

    fn stop_pax_ambience(&mut self) {
        self.pax_ambience = false;
    }

    fn pax_ambience(&self) -> bool {
        self.pax_ambience
    }

    fn pax_boarding(&self) -> bool {
        self.pax_boarding
    }

    fn pax_deboarding(&self) -> bool {
        self.pax_deboarding
    }

    fn pax_complete(&self) -> bool {
        self.pax_complete
    }
}
impl SimulationElement for A320BoardingSounds {
    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.pax_board_id, self.pax_boarding);
        writer.write(&self.pax_deboard_id, self.pax_deboarding);
        writer.write(&self.pax_complete_id, self.pax_complete);
        writer.write(&self.pax_ambience_id, self.pax_ambience);
    }
}
pub struct A320Payload {
    developer_state_id: VariableIdentifier,
    is_boarding_id: VariableIdentifier,
    is_gsx_enabled_id: VariableIdentifier,
    board_rate_id: VariableIdentifier,
    per_pax_weight_id: VariableIdentifier,
    developer_state: i8,
    is_boarding: bool,
    is_gsx_enabled: bool,
    board_rate: BoardingRate,
    per_pax_weight: Rc<Cell<Mass>>,
    pax: Vec<Pax>,
    cargo: Vec<Cargo>,
    boarding_sounds: A320BoardingSounds,
    time: Duration,
}
impl A320Payload {
    const DEFAULT_PER_PAX_WEIGHT_KG: f64 = 84.;
    pub fn new(context: &mut InitContext) -> Self {
        let per_pax_weight = Rc::new(Cell::new(Mass::new::<kilogram>(
            Self::DEFAULT_PER_PAX_WEIGHT_KG,
        )));

        let mut pax = Vec::new();

        for ps in A320Pax::iterator() {
            pax.push(Pax::new(
                context.get_identifier(A320_PAX[ps].pax_id.to_owned()),
                context.get_identifier(format!("{}_DESIRED", A320_PAX[ps].pax_id).to_owned()),
                context.get_identifier(A320_PAX[ps].payload_id.to_owned()),
                Rc::clone(&per_pax_weight),
            ));
        }

        let mut cargo = Vec::new();
        for cs in A320Cargo::iterator() {
            cargo.push(Cargo::new(
                context.get_identifier(A320_CARGO[cs].cargo_id.to_owned()),
                context.get_identifier(format!("{}_DESIRED", A320_CARGO[cs].cargo_id).to_owned()),
                context.get_identifier(A320_CARGO[cs].payload_id.to_owned()),
            ));
        }
        A320Payload {
            developer_state_id: context.get_identifier("DEVELOPER_STATE".to_owned()),
            is_boarding_id: context.get_identifier("BOARDING_STARTED_BY_USR".to_owned()),
            is_gsx_enabled_id: context.get_identifier("GSX_PAYLOAD_SYNC_ENABLED".to_owned()),
            board_rate_id: context.get_identifier("BOARDING_RATE".to_owned()),
            per_pax_weight_id: context.get_identifier("WB_PER_PAX_WEIGHT".to_owned()),
            developer_state: 0,
            is_boarding: false,
            is_gsx_enabled: false,
            board_rate: BoardingRate::Instant,
            per_pax_weight,
            boarding_sounds: A320BoardingSounds::new(
                context.get_identifier("SOUND_PAX_BOARDING".to_owned()),
                context.get_identifier("SOUND_PAX_DEBOARDING".to_owned()),
                context.get_identifier("SOUND_BOARDING_COMPLETE".to_owned()),
                context.get_identifier("SOUND_PAX_AMBIENCE".to_owned()),
            ),
            pax,
            cargo,
            time: Duration::from_nanos(0),
        }
    }

    pub(crate) fn update(&mut self, context: &UpdateContext) {
        if !self.is_developer_state_active() {
            self.ensure_payload_sync()
        };

        if self.is_gsx_enabled() {
            self.stop_boarding();
            self.stop_all_sounds();
            self.update_extern_gsx(context);
        } else {
            self.update_intern(context);
        }
    }

    fn ensure_payload_sync(&mut self) {
        for ps in A320Pax::iterator() {
            if !self.pax_is_sync(ps) {
                self.sync_pax(ps);
            }
        }

        for cs in A320Cargo::iterator() {
            if !self.cargo_is_sync(cs) {
                self.sync_cargo(cs);
            }
        }
    }

    fn update_extern_gsx(&mut self, _context: &UpdateContext) {
        // TODO: GSX integration in rust
    }

    fn update_intern(&mut self, context: &UpdateContext) {
        self.update_pax_ambience();

        if !self.is_boarding {
            self.time = Duration::from_nanos(0);
            self.stop_boarding_sounds();
            return;
        }

        let ms_delay = if self.board_rate() == BoardingRate::Instant {
            0
        } else if self.board_rate() == BoardingRate::Fast {
            1000
        } else {
            5000
        };

        let delta_time = context.delta();
        self.time += delta_time;
        if self.time.as_millis() > ms_delay {
            self.time = Duration::from_nanos(0);
            self.update_pax();
            self.update_cargo();
        }
        // Check sound before updating boarding status
        self.update_boarding_sounds();
        self.update_boarding_status();
    }

    fn update_boarding_status(&mut self) {
        if self.is_fully_loaded() {
            self.is_boarding = false;
        }
    }

    fn update_boarding_sounds(&mut self) {
        let pax_board = self.is_pax_boarding();
        self.play_sound_pax_boarding(pax_board);

        let pax_deboard = self.is_pax_deboarding();
        self.play_sound_pax_deboarding(pax_deboard);

        let pax_complete = self.is_pax_loaded() && self.is_boarding();
        self.play_sound_pax_complete(pax_complete);
    }

    fn update_pax_ambience(&mut self) {
        let pax_ambience = !self.has_no_pax();
        self.play_sound_pax_ambience(pax_ambience);
    }

    fn play_sound_pax_boarding(&mut self, playing: bool) {
        if playing {
            self.boarding_sounds.start_pax_boarding();
        } else {
            self.boarding_sounds.stop_pax_boarding();
        }
    }

    fn play_sound_pax_deboarding(&mut self, playing: bool) {
        if playing {
            self.boarding_sounds.start_pax_deboarding();
        } else {
            self.boarding_sounds.stop_pax_deboarding();
        }
    }

    fn play_sound_pax_complete(&mut self, playing: bool) {
        if playing {
            self.boarding_sounds.start_pax_complete();
        } else {
            self.boarding_sounds.stop_pax_complete();
        }
    }

    fn play_sound_pax_ambience(&mut self, playing: bool) {
        if playing {
            self.boarding_sounds.start_pax_ambience();
        } else {
            self.boarding_sounds.stop_pax_ambience();
        }
    }

    fn stop_boarding_sounds(&mut self) {
        self.boarding_sounds.stop_pax_boarding();
        self.boarding_sounds.stop_pax_deboarding();
        self.boarding_sounds.stop_pax_complete();
    }

    fn stop_all_sounds(&mut self) {
        self.boarding_sounds.stop_pax_boarding();
        self.boarding_sounds.stop_pax_deboarding();
        self.boarding_sounds.stop_pax_ambience();
        self.boarding_sounds.stop_pax_complete();
    }

    fn update_pax(&mut self) {
        for ps in A320Pax::iterator() {
            if self.pax_is_target(ps) {
                continue;
            }
            if self.board_rate == BoardingRate::Instant {
                self.move_all_pax(ps);
            } else {
                self.move_one_pax(ps);
                break;
            }
        }
    }

    fn update_cargo(&mut self) {
        for cs in A320Cargo::iterator() {
            if self.cargo_is_target(cs) {
                continue;
            }
            if self.board_rate == BoardingRate::Instant {
                self.move_all_cargo(cs);
            } else {
                self.move_one_cargo(cs);
                break;
            }
        }
    }

    fn is_developer_state_active(&mut self) -> bool {
        self.developer_state > 0
    }

    fn is_pax_boarding(&mut self) -> bool {
        for ps in A320Pax::iterator() {
            if self.pax_num(ps) < self.pax_target_num(ps) && self.is_boarding() {
                return true;
            }
        }
        false
    }

    fn is_pax_deboarding(&mut self) -> bool {
        for ps in A320Pax::iterator() {
            if self.pax_num(ps) > self.pax_target_num(ps) && self.is_boarding() {
                return true;
            }
        }
        false
    }

    fn is_pax_loaded(&mut self) -> bool {
        for ps in A320Pax::iterator() {
            if !self.pax_is_target(ps) {
                return false;
            }
        }
        true
    }

    fn is_cargo_loaded(&mut self) -> bool {
        for cs in A320Cargo::iterator() {
            if !self.cargo_is_target(cs) {
                return false;
            }
        }
        true
    }

    fn is_fully_loaded(&mut self) -> bool {
        self.is_pax_loaded() && self.is_cargo_loaded()
    }

    fn has_no_pax(&mut self) -> bool {
        for ps in A320Pax::iterator() {
            let pax_num = 0;
            if self.pax_num(ps) == pax_num {
                return true;
            }
        }
        false
    }

    fn board_rate(&self) -> BoardingRate {
        self.board_rate
    }

    fn pax_num(&self, ps: A320Pax) -> i8 {
        self.pax[ps as usize].pax_num() as i8
    }

    fn pax_target_num(&self, ps: A320Pax) -> i8 {
        self.pax[ps as usize].pax_target_num() as i8
    }

    fn pax_is_sync(&mut self, ps: A320Pax) -> bool {
        self.pax[ps as usize].payload_is_sync()
    }

    fn pax_is_target(&mut self, ps: A320Pax) -> bool {
        self.pax[ps as usize].pax_is_target()
    }

    fn sync_pax(&mut self, ps: A320Pax) {
        self.pax[ps as usize].load_payload();
    }

    fn move_all_pax(&mut self, ps: A320Pax) {
        self.pax[ps as usize].move_all_pax();
    }

    fn move_one_pax(&mut self, ps: A320Pax) {
        self.pax[ps as usize].move_one_pax();
    }

    fn cargo_is_sync(&mut self, cs: A320Cargo) -> bool {
        self.cargo[cs as usize].payload_is_sync()
    }

    fn cargo_is_target(&mut self, cs: A320Cargo) -> bool {
        self.cargo[cs as usize].cargo_is_target()
    }

    fn move_all_cargo(&mut self, cs: A320Cargo) {
        self.cargo[cs as usize].move_all_cargo();
    }

    fn move_one_cargo(&mut self, cs: A320Cargo) {
        self.cargo[cs as usize].move_one_cargo();
    }

    fn sync_cargo(&mut self, cs: A320Cargo) {
        self.cargo[cs as usize].load_payload();
    }

    fn is_boarding(&self) -> bool {
        self.is_boarding
    }

    fn is_gsx_enabled(&self) -> bool {
        self.is_gsx_enabled
    }

    fn stop_boarding(&mut self) {
        self.is_boarding = false;
    }

    fn per_pax_weight(&self) -> Mass {
        self.per_pax_weight.get()
    }
}
impl SimulationElement for A320Payload {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for ps in 0..self.pax.len() {
            self.pax[ps].accept(visitor);
        }
        for cs in 0..self.cargo.len() {
            self.cargo[cs].accept(visitor);
        }
        self.boarding_sounds.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.developer_state = reader.read(&self.developer_state_id);
        self.is_boarding = reader.read(&self.is_boarding_id);
        self.board_rate = reader.read(&self.board_rate_id);
        self.is_gsx_enabled = reader.read(&self.is_gsx_enabled_id);
        self.per_pax_weight
            .replace(Mass::new::<kilogram>(reader.read(&self.per_pax_weight_id)));
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.is_boarding_id, self.is_boarding);
        writer.write(
            &self.per_pax_weight_id,
            self.per_pax_weight().get::<kilogram>(),
        );
    }
}

#[cfg(test)]
mod boarding_test {
    const HOURS_TO_MINUTES: u64 = 60;
    const MINUTES_TO_SECONDS: u64 = 60;

    use rand::seq::IteratorRandom;
    use rand::SeedableRng;
    use systems::electrical::Electricity;
    use uom::si::mass::pound;

    use super::*;
    use crate::payload::A320Payload;
    use crate::systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft, SimulationElement, SimulationElementVisitor,
    };

    struct BoardingTestAircraft {
        boarding: A320Payload,
    }

    impl BoardingTestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                boarding: A320Payload::new(context),
            }
        }
    }
    impl Aircraft for BoardingTestAircraft {
        fn update_before_power_distribution(
            &mut self,
            context: &UpdateContext,
            _electricity: &mut Electricity,
        ) {
            self.boarding.update(context);
        }
    }
    impl SimulationElement for BoardingTestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.boarding.accept(visitor);

            visitor.visit(self);
        }
    }

    struct BoardingTestBed {
        test_bed: SimulationTestBed<BoardingTestAircraft>,
    }
    impl BoardingTestBed {
        fn new() -> Self {
            BoardingTestBed {
                test_bed: SimulationTestBed::new(BoardingTestAircraft::new),
            }
        }

        fn and_run(mut self) -> Self {
            self.run();

            self
        }

        fn and_stabilize(mut self) -> Self {
            let five_minutes = 5 * MINUTES_TO_SECONDS;
            self.test_bed
                .run_multiple_frames(Duration::from_secs(five_minutes));

            self
        }

        fn init_vars(mut self) -> Self {
            self.write_by_name("BOARDING_RATE", BoardingRate::Instant);
            self.write_by_name("WB_PER_PAX_WEIGHT", A320Payload::DEFAULT_PER_PAX_WEIGHT_KG);

            self
        }

        fn init_vars_gsx(mut self) -> Self {
            self.write_by_name("GSX_PAYLOAD_SYNC_ENABLED", true);

            self
        }

        fn instant_board_rate(mut self) -> Self {
            self.write_by_name("BOARDING_RATE", BoardingRate::Instant);

            self
        }

        fn fast_board_rate(mut self) -> Self {
            self.write_by_name("BOARDING_RATE", BoardingRate::Fast);

            self
        }

        fn real_board_rate(mut self) -> Self {
            self.write_by_name("BOARDING_RATE", BoardingRate::Real);

            self
        }

        fn load_pax(&mut self, ps: A320Pax, pax_qty: i8) {
            assert!(pax_qty <= A320_PAX[ps].max_pax);

            let per_pax_weight: Mass =
                Mass::new::<kilogram>(self.read_by_name("WB_PER_PAX_WEIGHT"));

            let seed = 380320;
            let mut rng = rand_pcg::Pcg32::seed_from_u64(seed);

            let binding: Vec<i8> = (0..A320_PAX[ps].max_pax).collect();
            let choices = binding
                .iter()
                .choose_multiple(&mut rng, pax_qty.try_into().unwrap());

            let mut pax_flag: u64 = 0;
            for c in choices {
                pax_flag ^= 1 << c;
            }

            let payload = Mass::new::<pound>(pax_qty as f64 * per_pax_weight.get::<pound>());

            self.write_by_name(&A320_PAX[ps].pax_id, pax_flag);
            self.write_by_name(&A320_PAX[ps].payload_id, payload);
        }

        fn target_pax(&mut self, ps: A320Pax, pax_qty: i8) {
            assert!(pax_qty <= A320_PAX[ps].max_pax);

            let seed = 747777;
            let mut rng = rand_pcg::Pcg32::seed_from_u64(seed);

            let binding: Vec<i8> = (0..A320_PAX[ps].max_pax).collect();
            let choices = binding
                .iter()
                .choose_multiple(&mut rng, pax_qty.try_into().unwrap());

            let mut pax_flag: u64 = 0;
            for c in choices {
                pax_flag ^= 1 << c;
            }

            self.write_by_name(&format!("{}_DESIRED", A320_PAX[ps].pax_id), pax_flag);
        }

        fn load_cargo(&mut self, cs: A320Cargo, cargo_qty: Mass) {
            assert!(cargo_qty <= A320_CARGO[cs].max_cargo);

            self.write_by_name(&A320_CARGO[cs].cargo_id, cargo_qty.get::<kilogram>());
            self.write_by_name(&A320_CARGO[cs].payload_id, cargo_qty.get::<pound>());
        }

        fn target_cargo(&mut self, cs: A320Cargo, cargo_qty: Mass) {
            assert!(cargo_qty <= A320_CARGO[cs].max_cargo);

            self.write_by_name(
                &format!("{}_DESIRED", A320_CARGO[cs].cargo_id),
                cargo_qty.get::<kilogram>(),
            );
        }

        fn start_boarding(mut self) -> Self {
            self.write_by_name("BOARDING_STARTED_BY_USR", true);
            self
        }

        fn stop_boarding(mut self) -> Self {
            self.write_by_name("BOARDING_STARTED_BY_USR", false);
            self
        }

        fn boarding_started(&mut self) {
            let is_boarding = self.is_boarding();
            let boarded_var: bool = self.read_by_name("BOARDING_STARTED_BY_USR");
            assert!(is_boarding);
            assert!(boarded_var);

            let pax_boarding_sound: bool = self.read_by_name("SOUND_PAX_BOARDING");
            let pax_deboarding_sound: bool = self.read_by_name("SOUND_PAX_DEBOARDING");
            assert!(self.sound_pax_boarding() || self.sound_pax_deboarding());
            assert!(pax_boarding_sound || pax_deboarding_sound);
        }

        fn boarding_stopped(&mut self) {
            let is_boarding = self.is_boarding();
            let boarded_var: bool = self.read_by_name("BOARDING_STARTED_BY_USR");
            assert!(!is_boarding);
            assert!(!boarded_var);

            let pax_boarding_sound: bool = self.read_by_name("SOUND_PAX_BOARDING");
            let pax_deboarding_sound: bool = self.read_by_name("SOUND_PAX_DEBOARDING");
            assert!(!self.sound_pax_boarding());
            assert!(!self.sound_pax_deboarding());
            assert!(!pax_boarding_sound);
            assert!(!pax_deboarding_sound);
        }

        fn sound_boarding_complete_reset(&mut self) {
            let pax_complete_sound: bool = self.read_by_name("SOUND_BOARDING_COMPLETE");
            assert!(!self.sound_pax_complete());
            assert!(!pax_complete_sound);
        }

        fn has_sound_pax_ambience(&mut self) {
            let pax_ambience: bool = self.read_by_name("SOUND_PAX_AMBIENCE");
            assert!(self.sound_pax_ambience());
            assert!(pax_ambience);
        }

        fn has_no_sound_pax_ambience(&mut self) {
            let pax_ambience: bool = self.read_by_name("SOUND_PAX_AMBIENCE");
            assert!(!self.sound_pax_ambience());
            assert!(!pax_ambience);
        }

        fn with_pax(mut self, ps: A320Pax, pax_qty: i8) -> Self {
            self.load_pax(ps, pax_qty);
            self
        }

        fn with_no_pax(mut self) -> Self {
            for ps in A320Pax::iterator() {
                self.load_pax(ps, 0);
            }
            self
        }

        fn with_half_pax(mut self) -> Self {
            for ps in A320Pax::iterator() {
                self.load_pax(ps, A320_PAX[ps].max_pax / 2);
            }
            self
        }

        fn with_full_pax(mut self) -> Self {
            for ps in A320Pax::iterator() {
                self.load_pax(ps, A320_PAX[ps].max_pax);
            }
            self
        }

        fn with_pax_target(mut self, ps: A320Pax, pax_qty: i8) -> Self {
            self.target_pax(ps, pax_qty);
            self
        }

        fn target_half_pax(mut self) -> Self {
            for ps in A320Pax::iterator() {
                self.target_pax(ps, A320_PAX[ps].max_pax / 2);
            }
            self
        }

        fn target_full_pax(mut self) -> Self {
            for ps in A320Pax::iterator() {
                self.target_pax(ps, A320_PAX[ps].max_pax);
            }
            self
        }

        fn target_no_pax(mut self) -> Self {
            for ps in A320Pax::iterator() {
                self.target_pax(ps, 0);
            }
            self
        }

        fn has_no_pax(&self) {
            for ps in A320Pax::iterator() {
                let pax_num = 0;
                let pax_payload = Mass::new::<pound>(0.);
                assert_eq!(self.pax_num(ps), pax_num);
                assert_eq!(
                    self.pax_payload(ps).get::<pound>().floor(),
                    pax_payload.get::<pound>().floor()
                );
            }
        }

        fn has_half_pax(&mut self) {
            let per_pax_weight: Mass =
                Mass::new::<kilogram>(self.read_by_name("WB_PER_PAX_WEIGHT"));

            for ps in A320Pax::iterator() {
                let pax_num = A320_PAX[ps].max_pax / 2;
                let pax_payload =
                    Mass::new::<pound>(pax_num as f64 * per_pax_weight.get::<pound>());
                assert_eq!(
                    self.pax_payload(ps).get::<pound>().floor(),
                    pax_payload.get::<pound>().floor()
                );
            }
        }

        fn has_full_pax(&mut self) {
            let per_pax_weight: Mass =
                Mass::new::<kilogram>(self.read_by_name("WB_PER_PAX_WEIGHT"));

            for ps in A320Pax::iterator() {
                let pax_num = A320_PAX[ps].max_pax;
                let pax_payload =
                    Mass::new::<pound>(pax_num as f64 * per_pax_weight.get::<pound>());
                assert_eq!(self.pax_num(ps), pax_num);
                assert_eq!(
                    self.pax_payload(ps).get::<pound>().floor(),
                    pax_payload.get::<pound>().floor()
                );
            }
        }

        fn load_half_cargo(mut self) -> Self {
            for cs in A320Cargo::iterator() {
                self.load_cargo(cs, A320_CARGO[cs].max_cargo / 2.);
            }
            self
        }

        fn load_full_cargo(mut self) -> Self {
            for cs in A320Cargo::iterator() {
                self.load_cargo(cs, A320_CARGO[cs].max_cargo);
            }
            self
        }

        fn has_no_cargo(&self) {
            for cs in A320Cargo::iterator() {
                let cargo = Mass::new::<kilogram>(0.);
                assert_eq!(
                    self.cargo(cs).get::<kilogram>().floor(),
                    cargo.get::<kilogram>().floor(),
                );
                assert_eq!(
                    self.cargo_payload(cs).get::<pound>().floor(),
                    cargo.get::<pound>().floor()
                );
            }
        }

        fn has_half_cargo(&mut self) {
            for cs in A320Cargo::iterator() {
                let cargo = A320_CARGO[cs].max_cargo / 2.;
                assert_eq!(
                    self.cargo(cs).get::<kilogram>().floor(),
                    cargo.get::<kilogram>().floor(),
                );
                assert_eq!(
                    self.cargo_payload(cs).get::<pound>().floor(),
                    cargo.get::<pound>().floor()
                );
            }
        }

        fn has_full_cargo(&mut self) {
            for cs in A320Cargo::iterator() {
                let cargo = A320_CARGO[cs].max_cargo;
                assert_eq!(
                    self.cargo(cs).get::<kilogram>().floor(),
                    cargo.get::<kilogram>().floor(),
                );
                assert_eq!(
                    self.cargo_payload(cs).get::<pound>().floor(),
                    cargo.get::<pound>().floor()
                );
            }
        }

        fn target_no_cargo(mut self) -> Self {
            for cs in A320Cargo::iterator() {
                self.target_cargo(cs, Mass::new::<kilogram>(0.));
            }
            self
        }

        fn target_half_cargo(mut self) -> Self {
            for cs in A320Cargo::iterator() {
                self.target_cargo(cs, A320_CARGO[cs].max_cargo / 2.);
            }
            self
        }

        fn target_full_cargo(mut self) -> Self {
            for cs in A320Cargo::iterator() {
                self.target_cargo(cs, A320_CARGO[cs].max_cargo);
            }
            self
        }

        fn is_boarding(&self) -> bool {
            self.query(|a| a.boarding.is_boarding())
        }

        fn board_rate(&self) -> BoardingRate {
            self.query(|a| a.boarding.board_rate())
        }

        fn sound_pax_ambience(&self) -> bool {
            self.query(|a| a.boarding.boarding_sounds.pax_ambience())
        }

        fn sound_pax_boarding(&self) -> bool {
            self.query(|a| a.boarding.boarding_sounds.pax_boarding())
        }

        fn sound_pax_deboarding(&self) -> bool {
            self.query(|a| a.boarding.boarding_sounds.pax_deboarding())
        }

        fn sound_pax_complete(&self) -> bool {
            self.query(|a| a.boarding.boarding_sounds.pax_complete())
        }

        fn pax_num(&self, ps: A320Pax) -> i8 {
            self.query(|a| a.boarding.pax[ps as usize].pax_num())
        }

        fn pax_payload(&self, ps: A320Pax) -> Mass {
            self.query(|a| a.boarding.pax[ps as usize].payload())
        }

        fn cargo(&self, cs: A320Cargo) -> Mass {
            self.query(|a| a.boarding.cargo[cs as usize].cargo())
        }

        fn cargo_payload(&self, cs: A320Cargo) -> Mass {
            self.query(|a| a.boarding.cargo[cs as usize].payload())
        }
    }

    impl TestBed for BoardingTestBed {
        type Aircraft = BoardingTestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<BoardingTestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<BoardingTestAircraft> {
            &mut self.test_bed
        }
    }

    fn test_bed() -> BoardingTestBed {
        BoardingTestBed::new()
    }

    fn test_bed_with() -> BoardingTestBed {
        test_bed()
    }

    #[test]
    fn boarding_init() {
        let test_bed = test_bed_with().init_vars();
        assert_eq!(test_bed.board_rate(), BoardingRate::Instant);
        assert!(!test_bed.is_boarding());
        test_bed.has_no_pax();
        test_bed.has_no_cargo();

        assert!(test_bed.contains_variable_with_name("BOARDING_STARTED_BY_USR"));
        assert!(test_bed.contains_variable_with_name("BOARDING_RATE"));
        assert!(test_bed.contains_variable_with_name("WB_PER_PAX_WEIGHT"));
        assert!(test_bed.contains_variable_with_name(&A320_PAX[A320Pax::A].pax_id));
        assert!(test_bed.contains_variable_with_name(&A320_PAX[A320Pax::B].pax_id));
        assert!(test_bed.contains_variable_with_name(&A320_PAX[A320Pax::C].pax_id));
        assert!(test_bed.contains_variable_with_name(&A320_PAX[A320Pax::D].pax_id));
    }
    #[test]
    fn loaded_no_pax() {
        let mut test_bed = test_bed_with().init_vars().with_no_pax().and_run();

        test_bed.has_no_pax();
        test_bed.has_no_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_no_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn loaded_full_pax() {
        let mut test_bed = test_bed_with().init_vars().with_full_pax().and_run();

        test_bed.has_full_pax();
        test_bed.has_no_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn loaded_half_pax() {
        let mut test_bed = test_bed_with().init_vars().with_half_pax().and_run();

        test_bed.has_half_pax();
        test_bed.has_no_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn loaded_no_pax_full_cargo() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_no_pax()
            .load_full_cargo()
            .and_run();

        test_bed.has_no_pax();
        test_bed.has_full_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_no_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn loaded_no_pax_half_cargo() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_no_pax()
            .load_half_cargo()
            .and_run();

        test_bed.has_no_pax();
        test_bed.has_half_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_no_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn loaded_half_use() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_half_pax()
            .load_half_cargo()
            .and_run();

        test_bed.has_half_pax();
        test_bed.has_half_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn target_half_pre_board() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .target_half_pax()
            .target_half_cargo()
            .and_run()
            .and_stabilize();

        test_bed.has_no_pax();
        test_bed.has_no_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_no_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn test_boarding_trigger_reset() {
        let mut test_bed = test_bed_with().init_vars().start_boarding().and_run();
        test_bed.boarding_stopped();
    }

    #[test]
    fn target_half_pax_trigger_and_finish_board() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .target_half_pax()
            .fast_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        test_bed.has_half_pax();
        test_bed.has_no_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn target_half_pax_trigger_and_finish_board_realtime_use() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .target_half_pax()
            .real_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        test_bed.boarding_started();

        let one_hour_in_seconds = HOURS_TO_MINUTES * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(one_hour_in_seconds));

        test_bed.has_half_pax();
        test_bed.has_no_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn loaded_half_idle_pending() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_half_pax()
            .load_half_cargo()
            .instant_board_rate()
            .and_run()
            .and_stabilize();

        let fifteen_minutes_in_seconds = 15 * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(fifteen_minutes_in_seconds));

        test_bed.has_half_pax();
        test_bed.has_half_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn target_half_and_board() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .target_half_pax()
            .target_half_cargo()
            .fast_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        test_bed.has_half_pax();
        test_bed.has_half_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn target_half_and_board_fifteen_minutes_idle() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .target_half_pax()
            .target_half_cargo()
            .fast_board_rate()
            .start_boarding()
            .and_run();

        test_bed.boarding_started();

        let fifteen_minutes_in_seconds = 15 * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(fifteen_minutes_in_seconds));

        test_bed.has_half_pax();
        test_bed.has_half_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn target_half_and_board_instant() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .target_half_pax()
            .target_half_cargo()
            .instant_board_rate()
            .start_boarding()
            .and_run();

        test_bed.has_half_pax();
        test_bed.has_half_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn start_half_pax_target_full_pax_fast_board() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_half_pax()
            .load_half_cargo()
            .target_full_pax()
            .target_half_cargo()
            .fast_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        test_bed.has_full_pax();
        test_bed.has_half_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn start_half_cargo_target_full_cargo_real_board() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_half_pax()
            .load_half_cargo()
            .target_half_pax()
            .target_full_cargo()
            .real_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        test_bed.boarding_started();

        let one_hour_in_seconds = HOURS_TO_MINUTES * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(one_hour_in_seconds));

        test_bed.has_half_pax();
        test_bed.has_full_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn start_half_target_full_instantly() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_half_pax()
            .load_half_cargo()
            .target_full_pax()
            .target_full_cargo()
            .instant_board_rate()
            .start_boarding()
            .and_run();

        test_bed.has_full_pax();
        test_bed.has_full_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn deboard_full_pax_full_cargo_idle_pending() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_full_pax()
            .load_full_cargo()
            .target_no_pax()
            .target_no_cargo()
            .fast_board_rate()
            .and_run()
            .and_stabilize();

        test_bed.has_full_pax();
        test_bed.has_full_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn deboard_full_pax_full_cargo_fast() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_full_pax()
            .load_full_cargo()
            .target_no_pax()
            .target_no_cargo()
            .fast_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        test_bed.has_no_pax();
        test_bed.has_no_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_no_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn deboard_half_pax_full_cargo_instantly() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_half_pax()
            .load_full_cargo()
            .target_no_pax()
            .target_no_cargo()
            .instant_board_rate()
            .start_boarding()
            .and_run();

        test_bed.has_no_pax();
        test_bed.has_no_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_no_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn deboard_half_real() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_half_pax()
            .load_half_cargo()
            .target_no_pax()
            .target_no_cargo()
            .real_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        test_bed.boarding_started();

        let one_hour_in_seconds = HOURS_TO_MINUTES * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(one_hour_in_seconds));

        test_bed.has_no_pax();
        test_bed.has_no_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_no_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn deboard_half_five_min_change_to_board_full_real() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_half_pax()
            .load_half_cargo()
            .target_no_pax()
            .target_no_cargo()
            .real_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        test_bed.boarding_started();

        test_bed = test_bed.target_full_pax().target_full_cargo();

        let one_hour_in_seconds = HOURS_TO_MINUTES * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(one_hour_in_seconds));

        test_bed.has_full_pax();
        test_bed.has_full_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn deboard_half_two_min_change_instant() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_half_pax()
            .load_half_cargo()
            .target_no_pax()
            .target_no_cargo()
            .real_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        test_bed.boarding_started();

        test_bed = test_bed.instant_board_rate().and_run();

        test_bed.has_no_pax();
        test_bed.has_no_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_no_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn deboard_half_two_min_change_instant_change_units_load_full_kg() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_half_pax()
            .load_half_cargo()
            .target_no_pax()
            .target_no_cargo()
            .real_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        test_bed.boarding_started();

        test_bed = test_bed
            .init_vars()
            .target_full_cargo()
            .instant_board_rate()
            .and_run();

        test_bed.has_no_pax();
        test_bed.has_full_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_no_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn detailed_test_with_multiple_stops() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .with_pax(A320Pax::A, 5)
            .with_pax(A320Pax::B, 1)
            .with_pax(A320Pax::C, 16)
            .with_pax(A320Pax::D, 42)
            .with_pax_target(A320Pax::A, 15)
            .with_pax_target(A320Pax::B, 14)
            .with_pax_target(A320Pax::C, 32)
            .with_pax_target(A320Pax::D, 12)
            .load_half_cargo()
            .real_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        test_bed.boarding_started();
        test_bed = test_bed.stop_boarding().and_run();

        test_bed.boarding_stopped();

        test_bed = test_bed.start_boarding();

        assert_eq!(test_bed.pax_num(A320Pax::A), 15);
        assert_eq!(test_bed.pax_num(A320Pax::B), 14);
        assert_eq!(test_bed.pax_num(A320Pax::C), 32);
        assert_eq!(test_bed.pax_num(A320Pax::D), 34);

        let five_minutes_in_seconds = 5 * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(five_minutes_in_seconds));

        assert_eq!(test_bed.pax_num(A320Pax::A), 15);
        assert_eq!(test_bed.pax_num(A320Pax::B), 14);
        assert_eq!(test_bed.pax_num(A320Pax::C), 32);
        assert_eq!(test_bed.pax_num(A320Pax::D), 12);
        test_bed.has_no_cargo();

        test_bed = test_bed
            .init_vars()
            .with_pax_target(A320Pax::A, 0)
            .with_pax_target(A320Pax::B, 0)
            .with_pax_target(A320Pax::C, 0)
            .with_pax_target(A320Pax::D, 0)
            .target_half_cargo()
            .instant_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        test_bed.has_no_pax();
        test_bed.has_half_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_no_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }

    #[test]
    fn disable_if_gsx_enabled() {
        let mut test_bed = test_bed_with()
            .init_vars()
            .init_vars_gsx()
            .target_half_pax()
            .target_full_cargo()
            .real_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        let one_hour_in_seconds = HOURS_TO_MINUTES * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(one_hour_in_seconds));

        test_bed.has_no_pax();
        test_bed.has_no_cargo();
        test_bed.boarding_stopped();

        test_bed = test_bed.and_run();
        test_bed.has_no_sound_pax_ambience();
        test_bed.sound_boarding_complete_reset();
    }
}