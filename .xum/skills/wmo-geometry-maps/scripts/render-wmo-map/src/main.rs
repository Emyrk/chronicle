use std::{
    env,
    error::Error,
    fs::File,
    io::{self, BufReader},
    path::{Path, PathBuf},
};

use serde::Deserialize;
use wow_wmo::{ParsedWmo, parse_wmo};

const DEFAULT_WIDTH: u32 = 1002;
const DEFAULT_HEIGHT: u32 = 668;
const PADDING: f32 = 24.0;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Placement {
    position: [f32; 3],
    rotation: [f32; 3],
    scale: f32,
}

#[derive(Clone)]
struct Triangle {
    points: [[f32; 3]; 3],
    average_z: f32,
    upwardness: f32,
}

fn parse_dimension(value: Option<String>, default: u32, name: &str) -> Result<u32, Box<dyn Error>> {
    let Some(value) = value else {
        return Ok(default);
    };
    let parsed: u32 = value.parse()?;
    if parsed < 2 * PADDING as u32 + 1 {
        return Err(format!("{name} must be greater than {}", 2 * PADDING as u32).into());
    }
    Ok(parsed)
}

fn group_paths(directory: &Path) -> Result<Vec<PathBuf>, Box<dyn Error>> {
    let mut paths: Vec<_> = directory
        .read_dir()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("wmo"))
        .collect();
    paths.sort();
    if paths.is_empty() {
        return Err(format!("no .wmo group files found in {}", directory.display()).into());
    }
    Ok(paths)
}

fn main() -> Result<(), Box<dyn Error>> {
    let mut args = env::args().skip(1);
    let usage = "usage: render-wmo-map GROUP_DIR PLACEMENTS.json OUTPUT.svg [WIDTH] [HEIGHT]";
    let directory = PathBuf::from(args.next().ok_or(usage)?);
    let placements_path = PathBuf::from(args.next().ok_or(usage)?);
    let output = PathBuf::from(args.next().ok_or(usage)?);
    let width = parse_dimension(args.next(), DEFAULT_WIDTH, "width")?;
    let height = parse_dimension(args.next(), DEFAULT_HEIGHT, "height")?;
    if args.next().is_some() {
        return Err(usage.into());
    }

    let placements: Vec<Placement> = serde_json::from_reader(File::open(&placements_path)?)?;
    if placements.len() != 1 {
        return Err(format!("expected one WDT placement, found {}", placements.len()).into());
    }
    let placement = &placements[0];
    if placement.position.iter().any(|value| value.abs() > 0.0001) {
        return Err(format!(
            "translated WDT placements are not supported yet: {:?}",
            placement.position
        )
        .into());
    }
    if placement.rotation.iter().any(|value| value.abs() > 0.0001) {
        return Err(format!(
            "rotated WDT placements are not supported yet: {:?}",
            placement.rotation
        )
        .into());
    }
    if !placement.scale.is_finite() || placement.scale <= 0.0 {
        return Err(format!("invalid WDT placement scale: {}", placement.scale).into());
    }
    let local_to_world = |point: [f32; 3]| {
        [
            point[0] * placement.scale,
            point[1] * placement.scale,
            point[2] * placement.scale,
        ]
    };

    let paths = group_paths(&directory)?;
    let mut triangles = Vec::new();
    let mut minimum = [f32::INFINITY; 3];
    let mut maximum = [f32::NEG_INFINITY; 3];
    let mut groups = 0usize;

    for path in &paths {
        let mut reader = BufReader::new(File::open(path)?);
        let parsed = parse_wmo(&mut reader).map_err(|error| {
            io::Error::other(format!("failed to parse {}: {error}", path.display()))
        })?;
        let ParsedWmo::Group(group) = parsed else {
            continue;
        };
        groups += 1;

        for vertex in &group.vertex_positions {
            let point = local_to_world([vertex.x, vertex.y, vertex.z]);
            for (axis, value) in point.into_iter().enumerate() {
                minimum[axis] = minimum[axis].min(value);
                maximum[axis] = maximum[axis].max(value);
            }
        }

        for indices in group.vertex_indices.chunks_exact(3) {
            let Some(a) = group.vertex_positions.get(indices[0] as usize) else {
                continue;
            };
            let Some(b) = group.vertex_positions.get(indices[1] as usize) else {
                continue;
            };
            let Some(c) = group.vertex_positions.get(indices[2] as usize) else {
                continue;
            };

            let points = [
                local_to_world([a.x, a.y, a.z]),
                local_to_world([b.x, b.y, b.z]),
                local_to_world([c.x, c.y, c.z]),
            ];
            let first = [
                points[1][0] - points[0][0],
                points[1][1] - points[0][1],
                points[1][2] - points[0][2],
            ];
            let second = [
                points[2][0] - points[0][0],
                points[2][1] - points[0][1],
                points[2][2] - points[0][2],
            ];
            let normal = [
                first[1] * second[2] - first[2] * second[1],
                first[2] * second[0] - first[0] * second[2],
                first[0] * second[1] - first[1] * second[0],
            ];
            let normal_length =
                (normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2])
                    .sqrt()
                    .max(0.001);

            triangles.push(Triangle {
                points,
                average_z: (points[0][2] + points[1][2] + points[2][2]) / 3.0,
                upwardness: (normal[2].abs() / normal_length).clamp(0.0, 1.0),
            });
        }
    }

    if groups == 0 || triangles.is_empty() || minimum.iter().any(|value| !value.is_finite()) {
        return Err("parsed no group geometry".into());
    }
    triangles.sort_by(|left, right| left.average_z.total_cmp(&right.average_z));

    // WoW map convention for this diagnostic: -Y points right and -X points down.
    let projected_minimum = [-maximum[1], -maximum[0]];
    let projected_maximum = [-minimum[1], -minimum[0]];
    let projected_width = (projected_maximum[0] - projected_minimum[0]).max(1.0);
    let projected_height = (projected_maximum[1] - projected_minimum[1]).max(1.0);
    let scale = (((width as f32) - 2.0 * PADDING) / projected_width)
        .min(((height as f32) - 2.0 * PADDING) / projected_height);
    let left = ((width as f32) - projected_width * scale) / 2.0;
    let top = ((height as f32) - projected_height * scale) / 2.0;
    let project = |point: [f32; 3]| {
        (
            left + (-point[1] - projected_minimum[0]) * scale,
            top + (-point[0] - projected_minimum[1]) * scale,
        )
    };

    let z_range = (maximum[2] - minimum[2]).max(1.0);
    let mut svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
<metadata>projection: screen-x=-world-y; screen-y=-world-x; uniform-scale={scale:.9}; world-min={minimum:?}; world-max={maximum:?}</metadata>
<rect width="{width}" height="{height}" fill="#10151a"/>
"##
    );

    for triangle in &triangles {
        let points = triangle.points.map(project);
        let elevation = ((triangle.average_z - minimum[2]) / z_range).clamp(0.0, 1.0);
        let light = 0.35 + 0.5 * triangle.upwardness;
        let red = (35.0 + 90.0 * elevation) * light;
        let green = (75.0 + 125.0 * elevation) * light;
        let blue = (55.0 + 85.0 * elevation) * light;
        svg.push_str(&format!(
            r##"<polygon points="{:.2},{:.2} {:.2},{:.2} {:.2},{:.2}" fill="rgb({:.0},{:.0},{:.0})" stroke="#07100c" stroke-opacity=".10" stroke-width=".25"/>
"##,
            points[0].0,
            points[0].1,
            points[1].0,
            points[1].1,
            points[2].0,
            points[2].1,
            red,
            green,
            blue
        ));
    }
    svg.push_str("</svg>\n");
    std::fs::write(&output, svg)?;

    eprintln!(
        "groups={groups} triangles={} world_min={minimum:?} world_max={maximum:?} projection=screen-x:-world-y,screen-y:-world-x scale={scale:.9} output={}",
        triangles.len(),
        output.display()
    );
    Ok(())
}
