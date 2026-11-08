package cli

import "testing"

func TestSplitAnimationGLB(t *testing.T) {
	t.Parallel()

	builder := newGLTFBuilder()
	position := builder.accessor(floatBytes([]float32{0, 0, 0}), 5126, 1, "VEC3", false, []float32{0, 0, 0}, []float32{0, 0, 0}, 34962)
	indices := builder.accessor([]byte{0, 0}, 5123, 1, "SCALAR", false, nil, nil, 34963)
	texture := builder.image([]byte("fake-png"))
	material := builder.material(texture, 0)
	builder.meshes = append(builder.meshes, map[string]any{"primitives": []map[string]any{{
		"attributes": map[string]int{"POSITION": position},
		"indices":    indices,
		"material":   material,
	}}})
	bone := builder.node(map[string]any{"name": "bone_0", "translation": [3]float32{0, 1, 0}})
	inverseBind := builder.accessor(floatBytes([]float32{1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1}), 5126, 1, "MAT4", false, nil, nil, 0)
	builder.skins = append(builder.skins, map[string]any{"joints": []int{bone}, "inverseBindMatrices": inverseBind})
	mesh := builder.node(map[string]any{"name": "mesh", "mesh": 0, "skin": 0})
	root := builder.node(map[string]any{"name": "model", "children": []int{mesh, bone}})
	addAnimation := func(name string, value float32) {
		input := builder.accessor(floatBytes([]float32{0, 1}), 5126, 2, "SCALAR", false, []float32{0}, []float32{1}, 0)
		output := builder.accessor(floatBytes([]float32{0, value, 0, 0, value, 0}), 5126, 2, "VEC3", false, nil, nil, 0)
		builder.animations = append(builder.animations, map[string]any{
			"name":     name,
			"samplers": []map[string]any{{"input": input, "output": output, "interpolation": "LINEAR"}},
			"channels": []map[string]any{{"sampler": 0, "target": map[string]any{"node": bone, "path": "translation"}}},
		})
	}
	addAnimation("Stand", 1)
	addAnimation("AttackUnarmed", 2)
	full, err := builder.glb(root)
	if err != nil {
		t.Fatal(err)
	}

	base, pack, err := splitAnimationGLB(full)
	if err != nil {
		t.Fatal(err)
	}
	if len(base) >= len(full) {
		t.Fatalf("base size %d is not smaller than full size %d", len(base), len(full))
	}
	baseDoc, baseBin, err := readGLBDocument(base)
	if err != nil {
		t.Fatal(err)
	}
	packDoc, packBin, err := readGLBDocument(pack)
	if err != nil {
		t.Fatal(err)
	}
	if len(baseBin) == 0 || len(packBin) == 0 {
		t.Fatalf("split binary chunks are empty: base=%d pack=%d", len(baseBin), len(packBin))
	}
	if got := animationNames(baseDoc); len(got) != 1 || got[0] != "Stand" {
		t.Fatalf("base animations = %v; want [Stand]", got)
	}
	if got := animationNames(packDoc); len(got) != 1 || got[0] != "AttackUnarmed" {
		t.Fatalf("pack animations = %v; want [AttackUnarmed]", got)
	}
	for _, key := range []string{"meshes", "skins", "images", "textures", "materials"} {
		if _, ok := packDoc[key]; ok {
			t.Errorf("animation pack unexpectedly contains %q", key)
		}
	}
	if _, ok := baseDoc["skins"]; !ok {
		t.Error("base does not contain its skin")
	}
	if !hasNamedNode(baseDoc, "bone_0") || !hasNamedNode(packDoc, "bone_0") {
		t.Error("base and animation pack must contain matching named skeleton nodes")
	}
}

func animationNames(doc map[string]any) []string {
	var names []string
	animations, _ := doc["animations"].([]any)
	for _, raw := range animations {
		animation, _ := raw.(map[string]any)
		name, _ := animation["name"].(string)
		names = append(names, name)
	}
	return names
}

func hasNamedNode(doc map[string]any, name string) bool {
	nodes, _ := doc["nodes"].([]any)
	for _, raw := range nodes {
		node, _ := raw.(map[string]any)
		if node["name"] == name {
			return true
		}
	}
	return false
}
