use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Debug, Serialize)]
pub struct OutputPlayer {
    pub name: String,
    pub handle: String,
    pub role_id: Option<u32>,
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
    let (_tail, mpq) =
        s2protocol::parser::parse(bytes).map_err(|e| err_js(format!("mpq parse error: {e:?}")))?;

    let details = s2protocol::read_details("replay", &mpq, bytes)
        .map_err(|e| err_js(format!("read_details error: {e:?}")))?;

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

    use s2protocol::tracker_events::ReplayTrackerEvent;

    // role_id_by_idx aligned with details.player_list
    let mut role_id_by_idx: Vec<Option<u32>> = vec![None; details.player_list.len()];

    let tracker_events = s2protocol::read_tracker_events("replay", &mpq, bytes)
        .map_err(|e| err_js(format!("read_tracker_events error: {e:?}")))?;

    for te in tracker_events {
        match te.event {
            ReplayTrackerEvent::UnitBorn(ev) => {
                if ev.unit_type_name == "ReplayStatsFunctionalRole" {
                    let role_idx = decode_int_from_point(ev.x, ev.y);
                    let tracker_player_id = ev.upkeep_player_id;
                    if tracker_player_id > 0 {
                        let idx = (tracker_player_id - 1) as usize;
                        if idx < role_id_by_idx.len() {
                            role_id_by_idx[idx] = Some(role_idx);
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
        let role_id = role_id_by_idx[i];
        players.push(OutputPlayer {
            name,
            handle,
            role_id,
        });
    }

    let out = Output {
        map_name,
        supported,
        players,
    };

    serde_wasm_bindgen::to_value(&out).map_err(|e| err_js(format!("serde error: {e:?}")))
}
