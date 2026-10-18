package cli

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"image/png"
	"maps"
	"math"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"

	"github.com/Gophercraft/core/format/blp"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"

	"github.com/coder/serpent"
)

// ExtractModelsCmd converts vanilla (version 256) M2 models to animated glTF
// binaries: mesh, skeleton, the first texture of each batch, and the
// locomotion animations walk mode plays.
func ExtractModelsCmd() *serpent.Command {
	var dbcPath string
	var server string
	var outDir string
	var models []string
	var list bool

	return &serpent.Command{
		Use:   "extract-models",
		Short: "Convert vanilla M2 models from a WoW client to animated .glb files.",
		Options: serpent.OptionSet{
			DBCOption(&dbcPath),
			ServerOption(&server),
			{
				Name:        "out",
				Description: "Output directory for the .glb files.",
				Flag:        "out",
				Value:       serpent.StringOf(&outDir),
			},
			{
				Name:        "model",
				Description: `Model path in the client, e.g. Creature\Chicken\Chicken.m2. Repeatable; append "=Texture\Path.blp" to override a creature skin.`,
				Flag:        "model",
				Value:       serpent.StringArrayOf(&models),
			},
			{
				Name:        "list",
				Description: "List the creature models that have a display (and so a skin), then exit.",
				Flag:        "list",
				Value:       serpent.BoolOf(&list),
			},
		},
		Handler: func(inv *serpent.Invocation) error {
			if !list && (outDir == "" || len(models) == 0) {
				return fmt.Errorf("--out and at least one --model are required")
			}
			resolved, err := ResolveDBCPath(dbcPath, server)
			if err != nil {
				return err
			}
			wc, err := dbcdb.New(resolved)
			if err != nil {
				return fmt.Errorf("(extract models) open wow client: %w", err)
			}
			//nolint:errcheck
			defer wc.Close()

			fallback, err := newMPQFallback(resolved)
			if err == nil {
				defer fallback.Close()
			}
			readFile := func(name string) ([]byte, error) {
				data, err := wc.ReadFile(name)
				if err == nil {
					return data, nil
				}
				if fallback != nil {
					return fallback.ReadFile(name)
				}
				return nil, err
			}
			skins, err := creatureSkins(readFile)
			if err != nil {
				return fmt.Errorf("read creature skins: %w", err)
			}
			if list {
				paths := slices.Sorted(maps.Keys(skins))
				for _, p := range paths {
					_, _ = fmt.Fprintln(inv.Stdout, p)
				}
				return nil
			}
			if err := os.MkdirAll(outDir, 0o755); err != nil {
				return fmt.Errorf("create output directory: %w", err)
			}

			for _, spec := range models {
				modelPath, skin, _ := strings.Cut(spec, "=")
				slots := skins[strings.ToLower(modelPath)]
				if skin != "" {
					slots[0] = skin
				}
				glb, info, err := convertM2(modelPath, slots, readFile)
				if err != nil {
					_, _ = fmt.Fprintf(inv.Stderr, "  SKIP %s: %v\n", modelPath, err)
					continue
				}
				name := strings.ToLower(strings.TrimSuffix(path.Base(strings.ReplaceAll(modelPath, `\`, "/")), path.Ext(modelPath)))
				out := filepath.Join(outDir, name+".glb")
				if err := os.WriteFile(out, glb, 0o644); err != nil {
					return fmt.Errorf("write %s: %w", out, err)
				}
				_, _ = fmt.Fprintf(inv.Stdout, "  %s -> %s (%d KB) %s\n", modelPath, out, len(glb)/1024, info)
			}
			return nil
		},
	}
}

// Animation IDs (AnimationData.dbc) worth exporting, with the clip names the
// map plays.
var m2ExportAnimations = map[uint16]string{
	0:  "Stand",
	4:  "Walk",
	5:  "Run",
	13: "WalkBackwards",
	37: "JumpStart",
	38: "Jump",
	39: "JumpEnd",
	40: "Fall",
	41: "SwimIdle",
	42: "Swim",
}

type m2Array struct{ count, offset uint32 }

type m2Reader struct{ data []byte }

func (r m2Reader) u8(off uint32) uint8   { return r.data[off] }
func (r m2Reader) u16(off uint32) uint16 { return binary.LittleEndian.Uint16(r.data[off:]) }
func (r m2Reader) i16(off uint32) int16  { return int16(r.u16(off)) }
func (r m2Reader) u32(off uint32) uint32 { return binary.LittleEndian.Uint32(r.data[off:]) }
func (r m2Reader) f32(off uint32) float32 {
	return math.Float32frombits(r.u32(off))
}
func (r m2Reader) arr(off uint32) m2Array { return m2Array{r.u32(off), r.u32(off + 4)} }

// WoW models are x forward, y left, z up; glTF is y up with models facing +z.
func (r m2Reader) vec3(off uint32) [3]float32 {
	return [3]float32{r.f32(off + 4), r.f32(off + 8), r.f32(off)}
}

func (r m2Reader) quat(off uint32) [4]float32 {
	return [4]float32{r.f32(off + 4), r.f32(off + 8), r.f32(off), r.f32(off + 12)}
}

type m2Track struct {
	interpolation  uint16
	globalSequence uint16
	ranges         m2Array
	timestamps     m2Array
	values         m2Array
}

func (r m2Reader) track(off uint32) m2Track {
	return m2Track{r.u16(off), r.u16(off + 2), r.arr(off + 4), r.arr(off + 12), r.arr(off + 20)}
}

type m2Bone struct {
	parent                         int16
	translation, rotation, scaling m2Track
	pivot                          [3]float32
}

type m2Sequence struct {
	id         uint16
	start, end uint32
}

// convertM2 converts one model; skins fills its creature skin texture slots
// (texture types 11 to 13).
func convertM2(modelPath string, skins [3]string, readFile func(string) ([]byte, error)) ([]byte, string, error) {
	data, err := readFile(modelPath)
	if err != nil {
		return nil, "", err
	}
	if len(data) < 240 || string(data[:4]) != "MD20" {
		return nil, "", fmt.Errorf("not an M2 file")
	}
	r := m2Reader{data}
	if version := r.u32(4); version != 256 {
		return nil, "", fmt.Errorf("unsupported M2 version %d (only vanilla 256)", version)
	}

	// Header (vanilla layout).
	sequencesArr := r.arr(28)
	bonesArr := r.arr(52)
	verticesArr := r.arr(68)
	viewsArr := r.arr(76)
	texturesArr := r.arr(92)
	materialsArr := r.arr(132)
	textureLookupArr := r.arr(148)
	if viewsArr.count == 0 {
		return nil, "", fmt.Errorf("no skin profiles")
	}

	sequences := make([]m2Sequence, sequencesArr.count)
	for i := range sequences {
		off := sequencesArr.offset + uint32(i)*68
		sequences[i] = m2Sequence{id: r.u16(off), start: r.u32(off + 4), end: r.u32(off + 8)}
	}

	bones := make([]m2Bone, bonesArr.count)
	for i := range bones {
		off := bonesArr.offset + uint32(i)*108
		bones[i] = m2Bone{
			parent:      r.i16(off + 8),
			translation: r.track(off + 12),
			rotation:    r.track(off + 40),
			scaling:     r.track(off + 68),
			pivot:       r.vec3(off + 96),
		}
	}

	// The first (most detailed) skin profile: local vertices, triangles and
	// submeshes, and the batches that texture them.
	view := viewsArr.offset
	localVerts := r.arr(view)
	triangles := r.arr(view + 8)
	submeshesArr := r.arr(view + 24)
	batchesArr := r.arr(view + 32)

	b := newGLTFBuilder()
	nLocal := int(localVerts.count)
	positions := make([]float32, 0, nLocal*3)
	normals := make([]float32, 0, nLocal*3)
	uvs := make([]float32, 0, nLocal*2)
	joints := make([]byte, 0, nLocal*4)
	weights := make([]byte, 0, nLocal*4)
	minPos := [3]float32{math.MaxFloat32, math.MaxFloat32, math.MaxFloat32}
	maxPos := [3]float32{-math.MaxFloat32, -math.MaxFloat32, -math.MaxFloat32}
	for i := 0; i < nLocal; i++ {
		global := uint32(r.u16(localVerts.offset + uint32(i)*2))
		off := verticesArr.offset + global*48
		p := r.vec3(off)
		for k := 0; k < 3; k++ {
			minPos[k] = min(minPos[k], p[k])
			maxPos[k] = max(maxPos[k], p[k])
		}
		positions = append(positions, p[:]...)
		n := r.vec3(off + 20)
		normals = append(normals, n[:]...)
		uvs = append(uvs, r.f32(off+32), r.f32(off+36))
		w := [4]byte{r.u8(off + 12), r.u8(off + 13), r.u8(off + 14), r.u8(off + 15)}
		if w == [4]byte{} {
			w[0] = 255
		}
		weights = append(weights, w[:]...)
		joints = append(joints, r.u8(off+16), r.u8(off+17), r.u8(off+18), r.u8(off+19))
	}
	attributes := map[string]int{
		"POSITION":   b.accessor(floatBytes(positions), 5126, nLocal, "VEC3", false, minPos[:], maxPos[:], 34962),
		"NORMAL":     b.accessor(floatBytes(normals), 5126, nLocal, "VEC3", false, nil, nil, 34962),
		"TEXCOORD_0": b.accessor(floatBytes(uvs), 5126, nLocal, "VEC2", false, nil, nil, 34962),
		"JOINTS_0":   b.accessor(joints, 5121, nLocal, "VEC4", false, nil, nil, 34962),
		"WEIGHTS_0":  b.accessor(weights, 5121, nLocal, "VEC4", true, nil, nil, 34962),
	}

	// Textures: hardcoded file names, or a creature skin from the model's folder.
	textureImages := make([]int, texturesArr.count)
	for i := range textureImages {
		off := texturesArr.offset + uint32(i)*16
		kind := r.u32(off)
		nameArr := r.arr(off + 8)
		name := ""
		if kind == 0 && nameArr.count > 1 {
			name = string(data[nameArr.offset : nameArr.offset+nameArr.count-1])
		} else if kind >= 11 && kind <= 13 {
			name = skins[kind-11]
		}
		textureImages[i] = -1
		if name == "" {
			continue
		}
		blpData, err := readFile(name)
		if err != nil {
			continue
		}
		img, err := blp.DecodeBytes(blpData)
		if err != nil {
			continue
		}
		var buf bytes.Buffer
		if err := png.Encode(&buf, img); err != nil {
			continue
		}
		textureImages[i] = b.image(buf.Bytes())
	}

	// One primitive per batch on the first material layer.
	var primitives []map[string]any
	materialFor := map[[2]int]int{}
	for i := uint32(0); i < batchesArr.count; i++ {
		off := batchesArr.offset + i*24
		if r.u16(off+12) != 0 { // materialLayer
			continue
		}
		submesh := submeshesArr.offset + uint32(r.u16(off+4))*32
		indexStart := uint32(r.u16(submesh + 8))
		indexCount := uint32(r.u16(submesh + 10))
		indices := make([]byte, 0, indexCount*2)
		for k := uint32(0); k < indexCount; k++ {
			indices = binary.LittleEndian.AppendUint16(indices, r.u16(triangles.offset+(indexStart+k)*2))
		}
		texture := -1
		if lookup := uint32(r.u16(off + 16)); lookup < textureLookupArr.count {
			if t := int(r.u16(textureLookupArr.offset + lookup*2)); t < len(textureImages) {
				texture = textureImages[t]
			}
		}
		blending := uint16(0)
		if m := uint32(r.u16(off + 10)); m < materialsArr.count {
			blending = r.u16(materialsArr.offset + m*4 + 2)
		}
		key := [2]int{texture, int(blending)}
		material, ok := materialFor[key]
		if !ok {
			material = b.material(texture, blending)
			materialFor[key] = material
		}
		primitives = append(primitives, map[string]any{
			"attributes": attributes,
			"indices":    b.accessor(indices, 5123, int(indexCount), "SCALAR", false, nil, nil, 34963),
			"material":   material,
		})
	}
	if len(primitives) == 0 {
		return nil, "", fmt.Errorf("no batches")
	}

	// Skeleton: a node per bone at its pivot, relative to its parent's.
	boneNode := make([]int, len(bones))
	for i := range bones {
		boneNode[i] = b.node(map[string]any{"name": fmt.Sprintf("bone_%d", i)})
	}
	rest := func(i int) [3]float32 {
		p := bones[i].pivot
		if parent := bones[i].parent; parent >= 0 {
			pp := bones[parent].pivot
			return [3]float32{p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]}
		}
		return p
	}
	var rootBones []int
	inverseBinds := make([]float32, 0, len(bones)*16)
	for i, bone := range bones {
		b.nodes[boneNode[i]]["translation"] = rest(i)
		if bone.parent >= 0 && int(bone.parent) < len(bones) {
			parent := b.nodes[boneNode[bone.parent]]
			children, _ := parent["children"].([]int)
			parent["children"] = append(children, boneNode[i])
		} else {
			rootBones = append(rootBones, boneNode[i])
		}
		p := bone.pivot
		inverseBinds = append(inverseBinds, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1)
	}
	mesh := len(b.meshes)
	b.meshes = append(b.meshes, map[string]any{"primitives": primitives})
	skin := map[string]any{"joints": boneNode}
	if len(bones) > 0 {
		skin["inverseBindMatrices"] = b.accessor(floatBytes(inverseBinds), 5126, len(bones), "MAT4", false, nil, nil, 0)
	}
	b.skins = append(b.skins, skin)
	meshNode := b.node(map[string]any{"name": "mesh", "mesh": mesh, "skin": 0})
	root := b.node(map[string]any{"name": "model", "children": append([]int{meshNode}, rootBones...)})

	// Animations: the first sequence of each exported ID.
	var exported []string
	seen := map[uint16]bool{}
	for si, seq := range sequences {
		name, ok := m2ExportAnimations[seq.id]
		// The first sequence of each ID is its main variation.
		if !ok || seen[seq.id] {
			continue
		}
		seen[seq.id] = true
		duration := float32(seq.end-seq.start) / 1000
		var channels, samplers []map[string]any
		addChannel := func(node int, pathName string, times []float32, values []float32, kind string, step bool) {
			interpolation := "LINEAR"
			if step {
				interpolation = "STEP"
			}
			input := b.accessor(floatBytes(times), 5126, len(times), "SCALAR", false, []float32{times[0]}, []float32{times[len(times)-1]}, 0)
			output := b.accessor(floatBytes(values), 5126, len(times), kind, false, nil, nil, 0)
			samplers = append(samplers, map[string]any{"input": input, "output": output, "interpolation": interpolation})
			channels = append(channels, map[string]any{"sampler": len(samplers) - 1, "target": map[string]any{"node": node, "path": pathName}})
		}
		keys := func(t m2Track) (first, last uint32, ok bool) {
			if t.globalSequence != 0xFFFF || uint32(si) >= t.ranges.count || t.timestamps.count == 0 {
				return 0, 0, false
			}
			first = r.u32(t.ranges.offset + uint32(si)*8)
			last = r.u32(t.ranges.offset + uint32(si)*8 + 4)
			return first, last, first <= last && last < t.timestamps.count
		}
		times := func(t m2Track, first, last uint32) []float32 {
			out := make([]float32, 0, last-first+1)
			for k := first; k <= last; k++ {
				ts := r.u32(t.timestamps.offset + k*4)
				out = append(out, max(0, float32(int64(ts)-int64(seq.start))/1000))
			}
			return out
		}
		for i, bone := range bones {
			if first, last, ok := keys(bone.translation); ok {
				base := rest(i)
				values := make([]float32, 0, (last-first+1)*3)
				for k := first; k <= last; k++ {
					v := r.vec3(bone.translation.values.offset + k*12)
					values = append(values, base[0]+v[0], base[1]+v[1], base[2]+v[2])
				}
				addChannel(boneNode[i], "translation", times(bone.translation, first, last), values, "VEC3", bone.translation.interpolation == 0)
			}
			if first, last, ok := keys(bone.rotation); ok {
				values := make([]float32, 0, (last-first+1)*4)
				for k := first; k <= last; k++ {
					q := r.quat(bone.rotation.values.offset + k*16)
					values = append(values, q[:]...)
				}
				addChannel(boneNode[i], "rotation", times(bone.rotation, first, last), values, "VEC4", bone.rotation.interpolation == 0)
			}
			if first, last, ok := keys(bone.scaling); ok {
				values := make([]float32, 0, (last-first+1)*3)
				for k := first; k <= last; k++ {
					s := r.vec3(bone.scaling.values.offset + k*12)
					values = append(values, s[:]...)
				}
				addChannel(boneNode[i], "scale", times(bone.scaling, first, last), values, "VEC3", bone.scaling.interpolation == 0)
			}
		}
		if len(channels) == 0 {
			continue
		}
		// Pin the clip's length so it loops on the sequence's own period.
		if duration > 0 {
			addChannel(root, "scale", []float32{0, duration}, []float32{1, 1, 1, 1, 1, 1}, "VEC3", false)
		}
		b.animations = append(b.animations, map[string]any{"name": name, "channels": channels, "samplers": samplers})
		exported = append(exported, name)
	}

	glb, err := b.glb(root)
	if err != nil {
		return nil, "", err
	}
	return glb, fmt.Sprintf("bones=%d verts=%d anims=%v", len(bones), nLocal, exported), nil
}

// creatureSkins maps each creature model path (lower case, .m2) to the skin
// textures of its first display in CreatureDisplayInfo. Gophercraft's
// CreatureModelData lacks vanilla's model name, so both DBCs are read raw
// with their 1.12 layouts.
func creatureSkins(readFile func(string) ([]byte, error)) (map[string][3]string, error) {
	models, err := readWDBC(readFile, `DBFilesClient\CreatureModelData.dbc`)
	if err != nil {
		return nil, err
	}
	modelPaths := map[uint32]string{}
	for _, record := range models.records {
		// ID, Flags, ModelName (.mdx in 1.12; the client loads the .m2).
		name := models.str(record, 2)
		modelPaths[record[0]] = strings.ToLower(strings.TrimSuffix(strings.TrimSuffix(name, ".mdx"), ".MDX") + ".m2")
	}
	displays, err := readWDBC(readFile, `DBFilesClient\CreatureDisplayInfo.dbc`)
	if err != nil {
		return nil, err
	}
	skins := map[string][3]string{}
	for _, record := range displays.records {
		// ID, ModelID, SoundID, ExtendedDisplayInfoID, Scale, Alpha, TextureVariation[3].
		model, ok := modelPaths[record[1]]
		if !ok || displays.str(record, 6) == "" {
			continue
		}
		if _, done := skins[model]; done {
			continue
		}
		dir := model[:strings.LastIndex(model, `\`)+1]
		var slots [3]string
		for i := range slots {
			if texture := displays.str(record, 6+i); texture != "" {
				slots[i] = dir + texture + ".blp"
			}
		}
		skins[model] = slots
	}
	return skins, nil
}

type wdbc struct {
	records [][]uint32
	strings []byte
}

func (d wdbc) str(record []uint32, field int) string {
	off := int(record[field])
	if off >= len(d.strings) {
		return ""
	}
	end := bytes.IndexByte(d.strings[off:], 0)
	if end < 0 {
		return ""
	}
	return string(d.strings[off : off+end])
}

// readWDBC reads a pre-BC DBC file: a header, fixed-size records of 4-byte
// fields, and a string block.
func readWDBC(readFile func(string) ([]byte, error), name string) (wdbc, error) {
	data, err := readFile(name)
	if err != nil {
		return wdbc{}, err
	}
	if len(data) < 20 || string(data[:4]) != "WDBC" {
		return wdbc{}, fmt.Errorf("%s: not a WDBC file", name)
	}
	count := binary.LittleEndian.Uint32(data[4:])
	fields := binary.LittleEndian.Uint32(data[8:])
	size := binary.LittleEndian.Uint32(data[12:])
	stringSize := binary.LittleEndian.Uint32(data[16:])
	if fields*4 != size || uint64(20)+uint64(count)*uint64(size)+uint64(stringSize) > uint64(len(data)) {
		return wdbc{}, fmt.Errorf("%s: unexpected layout", name)
	}
	out := wdbc{records: make([][]uint32, count)}
	for i := range out.records {
		record := make([]uint32, fields)
		base := 20 + uint32(i)*size
		for f := range record {
			record[f] = binary.LittleEndian.Uint32(data[base+uint32(f)*4:])
		}
		out.records[i] = record
	}
	stringsStart := 20 + count*size
	out.strings = data[stringsStart : stringsStart+stringSize]
	return out, nil
}

func floatBytes(values []float32) []byte {
	out := make([]byte, 0, len(values)*4)
	for _, v := range values {
		out = binary.LittleEndian.AppendUint32(out, math.Float32bits(v))
	}
	return out
}

// gltfBuilder collects a glTF document and its single binary buffer.
type gltfBuilder struct {
	bin         []byte
	bufferViews []map[string]any
	accessors   []map[string]any
	images      []map[string]any
	textures    []map[string]any
	materials   []map[string]any
	meshes      []map[string]any
	nodes       []map[string]any
	skins       []map[string]any
	animations  []map[string]any
}

func newGLTFBuilder() *gltfBuilder { return &gltfBuilder{} }

func (b *gltfBuilder) view(data []byte, target int) int {
	for len(b.bin)%4 != 0 {
		b.bin = append(b.bin, 0)
	}
	view := map[string]any{"buffer": 0, "byteOffset": len(b.bin), "byteLength": len(data)}
	if target != 0 {
		view["target"] = target
	}
	b.bin = append(b.bin, data...)
	b.bufferViews = append(b.bufferViews, view)
	return len(b.bufferViews) - 1
}

func (b *gltfBuilder) accessor(data []byte, componentType, count int, kind string, normalized bool, minV, maxV []float32, target int) int {
	accessor := map[string]any{"bufferView": b.view(data, target), "componentType": componentType, "count": count, "type": kind}
	if normalized {
		accessor["normalized"] = true
	}
	if minV != nil {
		accessor["min"] = minV
		accessor["max"] = maxV
	}
	b.accessors = append(b.accessors, accessor)
	return len(b.accessors) - 1
}

func (b *gltfBuilder) image(pngData []byte) int {
	b.images = append(b.images, map[string]any{"bufferView": b.view(pngData, 0), "mimeType": "image/png"})
	b.textures = append(b.textures, map[string]any{"source": len(b.images) - 1})
	return len(b.textures) - 1
}

// M2 blending modes: 0 opaque, 1 alpha key (cutout), 2+ blended.
func (b *gltfBuilder) material(texture int, blending uint16) int {
	pbr := map[string]any{"metallicFactor": 0, "roughnessFactor": 1}
	if texture >= 0 {
		pbr["baseColorTexture"] = map[string]any{"index": texture}
	}
	material := map[string]any{"pbrMetallicRoughness": pbr, "doubleSided": true}
	switch {
	case blending == 1:
		material["alphaMode"] = "MASK"
		material["alphaCutoff"] = 0.5
	case blending >= 2:
		material["alphaMode"] = "BLEND"
	}
	b.materials = append(b.materials, material)
	return len(b.materials) - 1
}

func (b *gltfBuilder) node(node map[string]any) int {
	b.nodes = append(b.nodes, node)
	return len(b.nodes) - 1
}

func (b *gltfBuilder) glb(root int) ([]byte, error) {
	for len(b.bin)%4 != 0 {
		b.bin = append(b.bin, 0)
	}
	doc := map[string]any{
		"asset":       map[string]any{"version": "2.0", "generator": "chronicle extract-models"},
		"scene":       0,
		"scenes":      []map[string]any{{"nodes": []int{root}}},
		"nodes":       b.nodes,
		"meshes":      b.meshes,
		"skins":       b.skins,
		"accessors":   b.accessors,
		"bufferViews": b.bufferViews,
		"buffers":     []map[string]any{{"byteLength": len(b.bin)}},
		"materials":   b.materials,
	}
	if len(b.images) > 0 {
		doc["images"] = b.images
		doc["textures"] = b.textures
	}
	if len(b.animations) > 0 {
		doc["animations"] = b.animations
	}
	jsonData, err := json.Marshal(doc)
	if err != nil {
		return nil, err
	}
	for len(jsonData)%4 != 0 {
		jsonData = append(jsonData, ' ')
	}
	var out bytes.Buffer
	total := 12 + 8 + len(jsonData) + 8 + len(b.bin)
	write := func(v uint32) { _ = binary.Write(&out, binary.LittleEndian, v) }
	write(0x46546C67) // "glTF"
	write(2)
	write(uint32(total))
	write(uint32(len(jsonData)))
	write(0x4E4F534A) // "JSON"
	out.Write(jsonData)
	write(uint32(len(b.bin)))
	write(0x004E4942) // "BIN\0"
	out.Write(b.bin)
	return out.Bytes(), nil
}
