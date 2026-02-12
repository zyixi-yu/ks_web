use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Debug, Serialize)]
pub struct OutputPlayer {
    pub name: String,
    pub handle: String,
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct Output {
    pub map_name: String,
    pub supported: bool,
    pub players: Vec<OutputPlayer>,
}

fn toon_handle(region: u8, realm: u32, id: u64) -> String {
    format!("{}-S2-{}-{}", region, realm, id)
}

fn decode_int_from_point(x: u8, y: u8) -> u32 {
    (x as u32) * 256 + (y as u32)
}

fn role_name_from_index(idx: u32) -> String {
    // Keep in sync with ks_constants.roles.Role indexes.
    // This is the minimal set we need for display.
    match idx {
        0 => "Kerrigan",
        1 => "Scientist",
        2 => "Dark Templar",
        3 => "Ascendant",
        4 => "Spirit",
        5 => "Ares",
        6 => "Prophet",
        7 => "Stukov",
        8 => "Artanis",
        9 => "Zagara",
        10 => "Engineer",
        11 => "Team Nova",
        12 => "Nomad",
        13 => "Dehaka",
        14 => "Helios",
        15 => "Random",
        16 => "Thakras",
        17 => "Swann",
        18 => "Warden",
        19 => "Selendis",
        20 => "Niadra",
        21 => "Mira",
        22 => "Scion",
        23 => "Technician",
        24 => "Warfield",
        25 => "Champion",
        26 => "Elementalist",
        27 => "Brakk",
        28 => "Glevig",
        29 => "Delta Squad",
        30 => "Phaegore",
        31 => "Alarak",
        32 => "Izsha",
        33 => "Malus",
        34 => "Kraith",
        35 => "Energizer",
        36 => "Andor",
        37 => "DJ",
        38 => "Rattlesnake",
        39 => "SgtHammer",
        40 => "Chew",
        41 => "Aewyn",
        42 => "Critter Lord",
        43 => "Nightingale",
        44 => "Sjlerk",
        45 => "Sophia",
        46 => "Jinara",
        47 => "Sir Roachington",
        48 => "Raszagal",
        _ => return format!("Role#{}", idx),
    }
    .to_string()
}

fn is_supported_map(title: &str) -> bool {
    title.contains("凯瑞甘生存") || title.contains("Kerrigan Survival")
}

fn err_js(msg: impl ToString) -> JsValue {
    JsValue::from_str(&msg.to_string())
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn parse_replay(bytes: &[u8]) -> Result<JsValue, JsValue> {
    let (_tail, mpq) = s2protocol::parser::parse(bytes).map_err(|e| err_js(format!("mpq parse error: {e:?}")))?;

    let details = s2protocol::read_details("replay", &mpq, bytes).map_err(|e| err_js(format!("read_details error: {e:?}")))?;

    let map_name = details.title.trim().to_string();
    let supported = is_supported_map(&map_name);

    if !supported {
        let out = Output {
            map_name,
            supported,
            players: vec![],
        };
        return serde_wasm_bindgen::to_value(&out).map_err(|e| err_js(format!("serde error: {e:?}")));
    }

    use std::collections::HashMap;
    use s2protocol::tracker_events::ReplayTrackerEvent;

    // Slot id -> player index (in details.player_list)
    let mut slot_to_idx: HashMap<u8, usize> = HashMap::new();
    for (i, p) in details.player_list.iter().enumerate() {
        if let Some(slot) = p.working_set_slot_id {
            slot_to_idx.insert(slot, i);
        }
    }

    // Tracker player_id -> slot_id (from PlayerSetup events)
    let mut tracker_player_to_slot: HashMap<u8, u8> = HashMap::new();

    // role_by_idx aligned with details.player_list
    let mut role_by_idx: Vec<Option<String>> = vec![None; details.player_list.len()];

    let tracker_events = s2protocol::read_tracker_events("replay", &mpq, bytes)
        .map_err(|e| err_js(format!("read_tracker_events error: {e:?}")))?;

    for te in tracker_events {
        match te.event {
            ReplayTrackerEvent::PlayerSetup(ps) => {
                if let Some(slot) = ps.slot_id {
                    if slot <= u8::MAX as u32 {
                        tracker_player_to_slot.insert(ps.player_id, slot as u8);
                    }
                }
            }
            ReplayTrackerEvent::UnitBorn(ev) => {
                if ev.unit_type_name == "ReplayStatsFunctionalRole" {
                    let role_idx = decode_int_from_point(ev.x, ev.y);
                    let role_name = role_name_from_index(role_idx);

                    let tracker_player_id = ev.upkeep_player_id;
                    if let Some(&slot_id) = tracker_player_to_slot.get(&tracker_player_id) {
                        if let Some(&pi) = slot_to_idx.get(&slot_id) {
                            role_by_idx[pi] = Some(role_name);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    let mut players = Vec::new();
    for (i, p) in details.player_list.iter().enumerate() {
        if p.observe != s2protocol::common::OBSERVE_NONE {
            continue;
        }
        let name = p.name.trim().to_string();
        if name.is_empty() {
            continue;
        }

        let handle = toon_handle(p.toon.region, p.toon.realm, p.toon.id);
        let role = role_by_idx[i].clone().unwrap_or_else(|| "Unknown".to_string());
        players.push(OutputPlayer { name, handle, role });
    }

    let out = Output {
        map_name,
        supported,
        players,
    };

    serde_wasm_bindgen::to_value(&out).map_err(|e| err_js(format!("serde error: {e:?}")))
}
