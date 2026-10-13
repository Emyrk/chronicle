use std::{
    env,
    error::Error,
    fs::{self, File},
    io::{self, BufReader},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tiny_skia::{FillRule, Paint, PathBuilder, Pixmap, Transform};
use wow_wmo::{ParsedWmo, parse_wmo};

const DEFAULT_WIDTH: u32 = 1200;
const DEFAULT_HEIGHT: u32 = 800;
const MAP_PADDING: f32 = 0.03;
const ADT_TILE_SIZE: f32 = 1600.0 / 3.0;
const ADT_CHUNK_SIZE: f32 = 100.0 / 3.0;
const ADT_CELL_SIZE: f32 = ADT_CHUNK_SIZE / 8.0;

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderMetadata {
    width: u32,
    height: u32,
    source: String,
    bounds: RenderBounds,
    triangles: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderBounds {
    min_x: f32,
    max_x: f32,
    min_y: f32,
    max_y: f32,
}

fn parse_dimension(value: Option<String>, default: u32, name: &str) -> Result<u32, Box<dyn Error>> {
    let Some(value) = value else {
        return Ok(default);
    };
    let parsed: u32 = value.parse()?;
    if parsed < 64 {
        return Err(format!("{name} must be at least 64").into());
    }
    Ok(parsed)
}

fn sorted_files(directory: &Path, extension: &str) -> Result<Vec<PathBuf>, Box<dyn Error>> {
    let mut paths: Vec<_> = directory
        .read_dir()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some(extension))
        .collect();
    paths.sort();
    if paths.is_empty() {
        return Err(format!("no .{extension} files found in {}", directory.display()).into());
    }
    Ok(paths)
}

fn triangle(points: [[f32; 3]; 3]) -> Triangle {
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
    let normal_length = (normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2])
        .sqrt()
        .max(0.001);
    Triangle {
        points,
        average_z: (points[0][2] + points[1][2] + points[2][2]) / 3.0,
        upwardness: (normal[2].abs() / normal_length).clamp(0.0, 1.0),
    }
}

fn wmo_local_to_world(point: [f32; 3], scale: f32) -> [f32; 3] {
    // WMO model-space horizontal axes run opposite combat-log world X/Y. Keep
    // the axes in order and negate both; swapping them rotates replay paths away
    // from the geometry. Boss telemetry anchors validate this transform.
    [-point[0] * scale, -point[1] * scale, point[2] * scale]
}

fn wmo_triangles(
    directory: &Path,
    placements_path: &Path,
) -> Result<Vec<Triangle>, Box<dyn Error>> {
    let placements: Vec<Placement> = serde_json::from_reader(File::open(placements_path)?)?;
    if placements.len() != 1 {
        return Err(format!("expected one WDT placement, found {}", placements.len()).into());
    }
    let placement = &placements[0];
    if placement.position.iter().any(|value| value.abs() > 0.0001) {
        return Err(format!(
            "translated WDT placements are not supported: {:?}",
            placement.position
        )
        .into());
    }
    if placement.rotation.iter().any(|value| value.abs() > 0.0001) {
        return Err(format!(
            "rotated WDT placements are not supported: {:?}",
            placement.rotation
        )
        .into());
    }
    if !placement.scale.is_finite() || placement.scale <= 0.0 {
        return Err(format!("invalid WDT placement scale: {}", placement.scale).into());
    }

    let paths = sorted_files(directory, "wmo")?;
    let mut triangles = Vec::new();
    for path in paths {
        let mut reader = BufReader::new(File::open(&path)?);
        let parsed = parse_wmo(&mut reader).map_err(|error| {
            io::Error::other(format!("failed to parse {}: {error}", path.display()))
        })?;
        let ParsedWmo::Group(group) = parsed else {
            continue;
        };
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
            triangles.push(triangle([
                wmo_local_to_world([a.x, a.y, a.z], placement.scale),
                wmo_local_to_world([b.x, b.y, b.z], placement.scale),
                wmo_local_to_world([c.x, c.y, c.z], placement.scale),
            ]));
        }
    }
    Ok(triangles)
}

struct AdtTerrainChunk {
    index_x: u32,
    index_y: u32,
    base: [f32; 3],
    heights: [f32; 145],
}

fn chunk_tag(data: &[u8]) -> String {
    data.iter().rev().map(|value| *value as char).collect()
}

fn read_f32(data: &[u8], offset: usize) -> Option<f32> {
    Some(f32::from_le_bytes(
        data.get(offset..offset + 4)?.try_into().ok()?,
    ))
}

fn adt_terrain_chunks(data: &[u8]) -> Result<Vec<AdtTerrainChunk>, Box<dyn Error>> {
    let mut chunks = Vec::new();
    let mut offset = 0;
    while offset + 8 <= data.len() {
        let tag = chunk_tag(&data[offset..offset + 4]);
        let size = u32::from_le_bytes(data[offset + 4..offset + 8].try_into()?) as usize;
        let start = offset + 8;
        let end = start.checked_add(size).ok_or("ADT chunk size overflow")?;
        if end > data.len() {
            return Err(format!("ADT chunk {tag} extends past end of file").into());
        }
        if tag == "MCNK" && size >= 128 {
            let payload = &data[start..end];
            let index_x = u32::from_le_bytes(payload[4..8].try_into()?);
            let index_y = u32::from_le_bytes(payload[8..12].try_into()?);
            let base = [
                read_f32(payload, 0x68).ok_or("MCNK missing position X")?,
                read_f32(payload, 0x6c).ok_or("MCNK missing position Y")?,
                read_f32(payload, 0x70).ok_or("MCNK missing position Z")?,
            ];
            let mut sub_offset = 128;
            while sub_offset + 8 <= payload.len() {
                let sub_tag = chunk_tag(&payload[sub_offset..sub_offset + 4]);
                let sub_size =
                    u32::from_le_bytes(payload[sub_offset + 4..sub_offset + 8].try_into()?)
                        as usize;
                let sub_start = sub_offset + 8;
                let Some(sub_end) = sub_start.checked_add(sub_size) else {
                    break;
                };
                if sub_end > payload.len() {
                    break;
                }
                if sub_tag == "MCVT" && sub_size >= 145 * 4 {
                    let mut heights = [0.0; 145];
                    for (index, height) in heights.iter_mut().enumerate() {
                        *height = read_f32(payload, sub_start + index * 4)
                            .ok_or("MCVT height data is truncated")?;
                    }
                    chunks.push(AdtTerrainChunk {
                        index_x,
                        index_y,
                        base,
                        heights,
                    });
                    break;
                }
                sub_offset = sub_end;
            }
        }
        offset = end;
    }
    Ok(chunks)
}

fn adt_outer_point(chunk: &AdtTerrainChunk, column: usize, row: usize) -> Option<[f32; 3]> {
    let height = *chunk.heights.get(row * 17 + column)?;
    Some([
        chunk.base[1] - column as f32 * ADT_CELL_SIZE,
        chunk.base[0] - row as f32 * ADT_CELL_SIZE,
        chunk.base[2] + height,
    ])
}

fn adt_inner_point(chunk: &AdtTerrainChunk, column: usize, row: usize) -> Option<[f32; 3]> {
    let height = *chunk.heights.get(row * 17 + 9 + column)?;
    Some([
        chunk.base[1] - (column as f32 + 0.5) * ADT_CELL_SIZE,
        chunk.base[0] - (row as f32 + 0.5) * ADT_CELL_SIZE,
        chunk.base[2] + height,
    ])
}

fn adt_tile_coordinates(path: &Path) -> Result<(u32, u32), Box<dyn Error>> {
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("ADT path has no UTF-8 file stem")?;
    let mut parts = stem.split('_');
    if parts.next() != Some("tile") {
        return Err(format!("unexpected ADT filename {stem:?}").into());
    }
    let column = parts.next().ok_or("ADT filename has no column")?.parse()?;
    let row = parts.next().ok_or("ADT filename has no row")?.parse()?;
    if parts.next().is_some() {
        return Err(format!("unexpected ADT filename {stem:?}").into());
    }
    Ok((column, row))
}

fn adt_triangles(directory: &Path) -> Result<Vec<Triangle>, Box<dyn Error>> {
    let paths = sorted_files(directory, "adt")?;
    let mut triangles = Vec::new();
    for path in paths {
        let (tile_column, tile_row) = adt_tile_coordinates(&path)?;
        let data = fs::read(&path)?;
        let mut chunks = adt_terrain_chunks(&data).map_err(|error| {
            io::Error::other(format!("failed to parse {}: {error}", path.display()))
        })?;
        for chunk in &mut chunks {
            chunk.base[0] =
                (32.0 - tile_row as f32) * ADT_TILE_SIZE - chunk.index_y as f32 * ADT_CHUNK_SIZE;
            chunk.base[1] =
                (32.0 - tile_column as f32) * ADT_TILE_SIZE - chunk.index_x as f32 * ADT_CHUNK_SIZE;
        }
        for chunk in &chunks {
            for row in 0..8 {
                for column in 0..8 {
                    let Some(top_left) = adt_outer_point(chunk, column, row) else {
                        continue;
                    };
                    let Some(top_right) = adt_outer_point(chunk, column + 1, row) else {
                        continue;
                    };
                    let Some(bottom_left) = adt_outer_point(chunk, column, row + 1) else {
                        continue;
                    };
                    let Some(bottom_right) = adt_outer_point(chunk, column + 1, row + 1) else {
                        continue;
                    };
                    let Some(center) = adt_inner_point(chunk, column, row) else {
                        continue;
                    };
                    triangles.extend([
                        triangle([top_left, top_right, center]),
                        triangle([top_right, bottom_right, center]),
                        triangle([bottom_right, bottom_left, center]),
                        triangle([bottom_left, top_left, center]),
                    ]);
                }
            }
        }
    }
    Ok(triangles)
}

fn fitted_bounds(
    triangles: &[Triangle],
    width: u32,
    height: u32,
) -> Result<RenderBounds, Box<dyn Error>> {
    let mut min_x = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for triangle in triangles {
        for point in triangle.points {
            min_x = min_x.min(point[0]);
            max_x = max_x.max(point[0]);
            min_y = min_y.min(point[1]);
            max_y = max_y.max(point[1]);
        }
    }
    if !min_x.is_finite() || max_x <= min_x || max_y <= min_y {
        return Err("geometry has invalid world bounds".into());
    }

    let center_x = (min_x + max_x) / 2.0;
    let center_y = (min_y + max_y) / 2.0;
    let mut span_x = (max_x - min_x) * (1.0 + MAP_PADDING * 2.0);
    let mut span_y = (max_y - min_y) * (1.0 + MAP_PADDING * 2.0);
    let image_aspect = width as f32 / height as f32;
    let projected_aspect = span_y / span_x;
    if projected_aspect < image_aspect {
        span_y = span_x * image_aspect;
    } else {
        span_x = span_y / image_aspect;
    }
    Ok(RenderBounds {
        min_x: center_x - span_x / 2.0,
        max_x: center_x + span_x / 2.0,
        min_y: center_y - span_y / 2.0,
        max_y: center_y + span_y / 2.0,
    })
}

fn render(
    mut triangles: Vec<Triangle>,
    source: &str,
    output: &Path,
    metadata_path: &Path,
    width: u32,
    height: u32,
) -> Result<(), Box<dyn Error>> {
    if triangles.is_empty() {
        return Err("parsed no geometry".into());
    }
    let bounds = fitted_bounds(&triangles, width, height)?;
    triangles.sort_by(|left, right| left.average_z.total_cmp(&right.average_z));
    let min_z = triangles
        .iter()
        .map(|item| item.average_z)
        .fold(f32::INFINITY, f32::min);
    let max_z = triangles
        .iter()
        .map(|item| item.average_z)
        .fold(f32::NEG_INFINITY, f32::max);
    let z_range = (max_z - min_z).max(1.0);
    let project = |point: [f32; 3]| {
        (
            ((bounds.max_y - point[1]) / (bounds.max_y - bounds.min_y)) * width as f32,
            ((bounds.max_x - point[0]) / (bounds.max_x - bounds.min_x)) * height as f32,
        )
    };

    let mut pixmap = Pixmap::new(width, height).ok_or("cannot allocate output pixmap")?;
    pixmap.fill(tiny_skia::Color::from_rgba8(12, 17, 20, 255));
    for triangle in &triangles {
        let points = triangle.points.map(project);
        let elevation = ((triangle.average_z - min_z) / z_range).clamp(0.0, 1.0);
        let light = 0.42 + 0.48 * triangle.upwardness;
        let (red, green, blue) = if source == "adt-terrain" {
            (
                (55.0 + 90.0 * elevation) * light,
                (80.0 + 125.0 * elevation) * light,
                (48.0 + 65.0 * elevation) * light,
            )
        } else {
            (
                (38.0 + 95.0 * elevation) * light,
                (70.0 + 120.0 * elevation) * light,
                (58.0 + 80.0 * elevation) * light,
            )
        };
        let mut builder = PathBuilder::new();
        builder.move_to(points[0].0, points[0].1);
        builder.line_to(points[1].0, points[1].1);
        builder.line_to(points[2].0, points[2].1);
        builder.close();
        let Some(path) = builder.finish() else {
            continue;
        };
        let mut paint = Paint::default();
        paint.set_color_rgba8(red as u8, green as u8, blue as u8, 255);
        paint.anti_alias = true;
        pixmap.fill_path(
            &path,
            &paint,
            FillRule::Winding,
            Transform::identity(),
            None,
        );
    }
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    pixmap.save_png(output)?;
    let metadata = RenderMetadata {
        width,
        height,
        source: source.to_string(),
        bounds,
        triangles: triangles.len(),
    };
    std::fs::write(metadata_path, serde_json::to_vec_pretty(&metadata)?)?;
    eprintln!(
        "source={source} triangles={} output={} metadata={}",
        triangles.len(),
        output.display(),
        metadata_path.display(),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_chunk(tag: &str, payload: &[u8]) -> Vec<u8> {
        let mut data = tag.as_bytes().iter().rev().copied().collect::<Vec<_>>();
        data.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        data.extend_from_slice(payload);
        data
    }

    #[test]
    fn reads_wdt_coordinates_from_exported_adt_filename() {
        assert_eq!(
            adt_tile_coordinates(Path::new("tile_38_42.adt")).expect("valid coordinates"),
            (38, 42),
        );
    }

    #[test]
    fn parses_terrain_without_parsing_unrelated_adt_chunks() {
        let mut payload = vec![0; 128];
        payload[0x68..0x6c].copy_from_slice(&10.0_f32.to_le_bytes());
        payload[0x6c..0x70].copy_from_slice(&20.0_f32.to_le_bytes());
        payload[0x70..0x74].copy_from_slice(&30.0_f32.to_le_bytes());
        let mut heights = Vec::new();
        for value in 0..145 {
            heights.extend_from_slice(&(value as f32).to_le_bytes());
        }
        payload.extend_from_slice(&test_chunk("MCVT", &heights));

        let chunks = adt_terrain_chunks(&test_chunk("MCNK", &payload)).expect("valid terrain");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].base, [10.0, 20.0, 30.0]);
        assert_eq!(chunks[0].heights[144], 144.0);
    }

    #[test]
    fn fitted_bounds_preserve_output_aspect_ratio() {
        let triangles = vec![triangle([
            [0.0, 0.0, 0.0],
            [100.0, 0.0, 0.0],
            [0.0, 100.0, 0.0],
        ])];
        let bounds = fitted_bounds(&triangles, 1200, 800).expect("valid bounds");
        let projected_aspect = (bounds.max_y - bounds.min_y) / (bounds.max_x - bounds.min_x);
        assert!((projected_aspect - 1.5).abs() < 0.0001);
    }

    #[test]
    fn global_wmo_negates_model_xy_without_swapping_axes() {
        assert_eq!(
            wmo_local_to_world([12.0, -34.0, 5.0], 2.0),
            [-24.0, 68.0, 10.0],
        );
    }

    #[test]
    fn horizontal_triangle_is_fully_upward_facing() {
        let value = triangle([[0.0, 0.0, 3.0], [1.0, 0.0, 3.0], [0.0, 1.0, 3.0]]);
        assert!((value.upwardness - 1.0).abs() < 0.0001);
        assert!((value.average_z - 3.0).abs() < 0.0001);
    }
}

fn main() -> Result<(), Box<dyn Error>> {
    let mut args = env::args().skip(1);
    let mode = args.next().ok_or("usage: render-wow-map <wmo|adt> ...")?;
    match mode.as_str() {
        "wmo" => {
            let directory = PathBuf::from(args.next().ok_or("missing WMO group directory")?);
            let placements = PathBuf::from(args.next().ok_or("missing placements JSON")?);
            let output = PathBuf::from(args.next().ok_or("missing output PNG")?);
            let metadata = PathBuf::from(args.next().ok_or("missing output metadata JSON")?);
            let width = parse_dimension(args.next(), DEFAULT_WIDTH, "width")?;
            let height = parse_dimension(args.next(), DEFAULT_HEIGHT, "height")?;
            if args.next().is_some() {
                return Err("too many arguments".into());
            }
            render(
                wmo_triangles(&directory, &placements)?,
                "wmo-geometry",
                &output,
                &metadata,
                width,
                height,
            )
        }
        "adt" => {
            let directory = PathBuf::from(args.next().ok_or("missing ADT directory")?);
            let output = PathBuf::from(args.next().ok_or("missing output PNG")?);
            let metadata = PathBuf::from(args.next().ok_or("missing output metadata JSON")?);
            let width = parse_dimension(args.next(), DEFAULT_WIDTH, "width")?;
            let height = parse_dimension(args.next(), DEFAULT_HEIGHT, "height")?;
            if args.next().is_some() {
                return Err("too many arguments".into());
            }
            render(
                adt_triangles(&directory)?,
                "adt-terrain",
                &output,
                &metadata,
                width,
                height,
            )
        }
        _ => Err(format!("unknown render mode {mode:?}").into()),
    }
}
