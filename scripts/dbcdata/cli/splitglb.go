package cli

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"sort"
)

// splitAnimationGLB keeps the skinned model, skeleton, and Stand clip in the
// base GLB. Every other clip is moved into a meshless GLB whose identically
// named skeleton nodes let Three.js bind the clips to the loaded base model.
func splitAnimationGLB(full []byte) ([]byte, []byte, error) {
	doc, bin, err := readGLBDocument(full)
	if err != nil {
		return nil, nil, err
	}
	base, err := cloneGLBDocument(doc)
	if err != nil {
		return nil, nil, err
	}
	animations, _ := doc["animations"].([]any)
	var stand, deferred []any
	for _, raw := range animations {
		animation, _ := raw.(map[string]any)
		if animation["name"] == "Stand" {
			stand = append(stand, raw)
		} else {
			deferred = append(deferred, raw)
		}
	}
	setAnimations(base, stand)
	base, baseBin, err := compactGLBDocument(base, bin)
	if err != nil {
		return nil, nil, fmt.Errorf("compact base: %w", err)
	}

	pack, err := cloneGLBDocument(doc)
	if err != nil {
		return nil, nil, err
	}
	setAnimations(pack, deferred)
	delete(pack, "meshes")
	delete(pack, "skins")
	delete(pack, "materials")
	delete(pack, "images")
	delete(pack, "textures")
	if nodes, ok := pack["nodes"].([]any); ok {
		for _, raw := range nodes {
			if node, ok := raw.(map[string]any); ok {
				delete(node, "mesh")
				delete(node, "skin")
			}
		}
	}
	pack, packBin, err := compactGLBDocument(pack, bin)
	if err != nil {
		return nil, nil, fmt.Errorf("compact animation pack: %w", err)
	}
	baseGLB, err := writeGLBDocument(base, baseBin)
	if err != nil {
		return nil, nil, err
	}
	packGLB, err := writeGLBDocument(pack, packBin)
	if err != nil {
		return nil, nil, err
	}
	return baseGLB, packGLB, nil
}

func setAnimations(doc map[string]any, animations []any) {
	if len(animations) == 0 {
		delete(doc, "animations")
		return
	}
	doc["animations"] = animations
}

func readGLBDocument(glb []byte) (map[string]any, []byte, error) {
	if len(glb) < 20 || string(glb[:4]) != "glTF" || binary.LittleEndian.Uint32(glb[4:]) != 2 || int(binary.LittleEndian.Uint32(glb[8:])) != len(glb) {
		return nil, nil, fmt.Errorf("invalid GLB 2.0 header")
	}
	jsonLength := int(binary.LittleEndian.Uint32(glb[12:]))
	if 20+jsonLength+8 > len(glb) || binary.LittleEndian.Uint32(glb[16:]) != 0x4E4F534A {
		return nil, nil, fmt.Errorf("invalid GLB JSON chunk")
	}
	var doc map[string]any
	if err := json.Unmarshal(bytes.TrimRight(glb[20:20+jsonLength], " \x00"), &doc); err != nil {
		return nil, nil, fmt.Errorf("decode GLB JSON: %w", err)
	}
	binHeader := 20 + jsonLength
	binLength := int(binary.LittleEndian.Uint32(glb[binHeader:]))
	if binary.LittleEndian.Uint32(glb[binHeader+4:]) != 0x004E4942 || binHeader+8+binLength != len(glb) {
		return nil, nil, fmt.Errorf("invalid GLB binary chunk")
	}
	return doc, glb[binHeader+8:], nil
}

func cloneGLBDocument(doc map[string]any) (map[string]any, error) {
	data, err := json.Marshal(doc)
	if err != nil {
		return nil, err
	}
	var clone map[string]any
	if err := json.Unmarshal(data, &clone); err != nil {
		return nil, err
	}
	return clone, nil
}

func gltfIndex(value any) (int, bool) {
	number, ok := value.(float64)
	return int(number), ok && number >= 0 && number == float64(int(number))
}

func compactGLBDocument(doc map[string]any, oldBin []byte) (map[string]any, []byte, error) {
	accessors, _ := doc["accessors"].([]any)
	views, _ := doc["bufferViews"].([]any)
	accessorRefs := map[int]bool{}
	addAccessor := func(value any) {
		if index, ok := gltfIndex(value); ok {
			accessorRefs[index] = true
		}
	}
	if meshes, ok := doc["meshes"].([]any); ok {
		for _, meshRaw := range meshes {
			mesh, _ := meshRaw.(map[string]any)
			primitives, _ := mesh["primitives"].([]any)
			for _, primitiveRaw := range primitives {
				primitive, _ := primitiveRaw.(map[string]any)
				if attributes, ok := primitive["attributes"].(map[string]any); ok {
					for _, value := range attributes {
						addAccessor(value)
					}
				}
				addAccessor(primitive["indices"])
			}
		}
	}
	if skins, ok := doc["skins"].([]any); ok {
		for _, skinRaw := range skins {
			skin, _ := skinRaw.(map[string]any)
			addAccessor(skin["inverseBindMatrices"])
		}
	}
	if animations, ok := doc["animations"].([]any); ok {
		for _, animationRaw := range animations {
			animation, _ := animationRaw.(map[string]any)
			samplers, _ := animation["samplers"].([]any)
			for _, samplerRaw := range samplers {
				sampler, _ := samplerRaw.(map[string]any)
				addAccessor(sampler["input"])
				addAccessor(sampler["output"])
			}
		}
	}

	oldAccessorIndices := sortedIndices(accessorRefs)
	accessorMap := make(map[int]int, len(oldAccessorIndices))
	viewRefs := map[int]bool{}
	newAccessors := make([]any, 0, len(oldAccessorIndices))
	for _, oldIndex := range oldAccessorIndices {
		if oldIndex >= len(accessors) {
			return nil, nil, fmt.Errorf("accessor %d out of range", oldIndex)
		}
		accessor, _ := accessors[oldIndex].(map[string]any)
		viewIndex, ok := gltfIndex(accessor["bufferView"])
		if !ok {
			return nil, nil, fmt.Errorf("accessor %d has no bufferView", oldIndex)
		}
		viewRefs[viewIndex] = true
		accessorMap[oldIndex] = len(newAccessors)
		newAccessors = append(newAccessors, accessor)
	}
	if images, ok := doc["images"].([]any); ok {
		for _, imageRaw := range images {
			image, _ := imageRaw.(map[string]any)
			if viewIndex, ok := gltfIndex(image["bufferView"]); ok {
				viewRefs[viewIndex] = true
			}
		}
	}

	oldViewIndices := sortedIndices(viewRefs)
	viewMap := make(map[int]int, len(oldViewIndices))
	newViews := make([]any, 0, len(oldViewIndices))
	var newBin []byte
	for _, oldIndex := range oldViewIndices {
		if oldIndex >= len(views) {
			return nil, nil, fmt.Errorf("bufferView %d out of range", oldIndex)
		}
		view, _ := views[oldIndex].(map[string]any)
		offset, _ := gltfIndex(view["byteOffset"])
		length, ok := gltfIndex(view["byteLength"])
		if !ok || offset+length > len(oldBin) {
			return nil, nil, fmt.Errorf("bufferView %d exceeds binary chunk", oldIndex)
		}
		for len(newBin)%4 != 0 {
			newBin = append(newBin, 0)
		}
		view["byteOffset"] = len(newBin)
		view["buffer"] = 0
		newBin = append(newBin, oldBin[offset:offset+length]...)
		viewMap[oldIndex] = len(newViews)
		newViews = append(newViews, view)
	}
	for _, raw := range newAccessors {
		accessor, _ := raw.(map[string]any)
		oldIndex, _ := gltfIndex(accessor["bufferView"])
		accessor["bufferView"] = viewMap[oldIndex]
	}
	if images, ok := doc["images"].([]any); ok {
		for _, imageRaw := range images {
			image, _ := imageRaw.(map[string]any)
			if oldIndex, ok := gltfIndex(image["bufferView"]); ok {
				image["bufferView"] = viewMap[oldIndex]
			}
		}
	}
	rewriteAccessorReferences(doc, accessorMap)
	doc["accessors"] = newAccessors
	doc["bufferViews"] = newViews
	doc["buffers"] = []any{map[string]any{"byteLength": len(newBin)}}
	return doc, newBin, nil
}

func rewriteAccessorReferences(doc map[string]any, indices map[int]int) {
	rewrite := func(container map[string]any, key string) {
		if oldIndex, ok := gltfIndex(container[key]); ok {
			container[key] = indices[oldIndex]
		}
	}
	if meshes, ok := doc["meshes"].([]any); ok {
		for _, meshRaw := range meshes {
			mesh, _ := meshRaw.(map[string]any)
			primitives, _ := mesh["primitives"].([]any)
			for _, primitiveRaw := range primitives {
				primitive, _ := primitiveRaw.(map[string]any)
				if attributes, ok := primitive["attributes"].(map[string]any); ok {
					for key := range attributes {
						rewrite(attributes, key)
					}
				}
				rewrite(primitive, "indices")
			}
		}
	}
	if skins, ok := doc["skins"].([]any); ok {
		for _, skinRaw := range skins {
			skin, _ := skinRaw.(map[string]any)
			rewrite(skin, "inverseBindMatrices")
		}
	}
	if animations, ok := doc["animations"].([]any); ok {
		for _, animationRaw := range animations {
			animation, _ := animationRaw.(map[string]any)
			samplers, _ := animation["samplers"].([]any)
			for _, samplerRaw := range samplers {
				sampler, _ := samplerRaw.(map[string]any)
				rewrite(sampler, "input")
				rewrite(sampler, "output")
			}
		}
	}
}

func sortedIndices(values map[int]bool) []int {
	indices := make([]int, 0, len(values))
	for index := range values {
		indices = append(indices, index)
	}
	sort.Ints(indices)
	return indices
}

func writeGLBDocument(doc map[string]any, bin []byte) ([]byte, error) {
	for len(bin)%4 != 0 {
		bin = append(bin, 0)
	}
	if buffers, ok := doc["buffers"].([]any); ok && len(buffers) > 0 {
		if buffer, ok := buffers[0].(map[string]any); ok {
			buffer["byteLength"] = len(bin)
		}
	}
	jsonData, err := json.Marshal(doc)
	if err != nil {
		return nil, err
	}
	for len(jsonData)%4 != 0 {
		jsonData = append(jsonData, ' ')
	}
	var out bytes.Buffer
	total := 12 + 8 + len(jsonData) + 8 + len(bin)
	write := func(value uint32) { _ = binary.Write(&out, binary.LittleEndian, value) }
	write(0x46546C67)
	write(2)
	write(uint32(total))
	write(uint32(len(jsonData)))
	write(0x4E4F534A)
	out.Write(jsonData)
	write(uint32(len(bin)))
	write(0x004E4942)
	out.Write(bin)
	return out.Bytes(), nil
}
