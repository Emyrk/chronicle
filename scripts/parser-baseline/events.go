package main

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"slices"

	pb "github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
)

// Explicitly enumerate supported streams; schema additions must fail, not vanish.
var eventMessages = map[database.LogInstanceEventType]proto.Message{
	"damage": &pb.Damage{}, "heal": &pb.Heal{}, "resource_change": &pb.ResourceChange{},
	"extra_attack": &pb.ExtraAttack{}, "slain": &pb.Slain{}, "cast": &pb.Cast{},
	"aura": &pb.Aura{}, "spell_go": &pb.SpellGo{}, "aura_cast": &pb.AuraCast{},
	"spell_start": &pb.SpellStart{}, "spell_fail": &pb.SpellFail{},
	"unit_classification": &pb.UnitClassification{}, "dispel": &pb.Dispel{},
	"combatant_info": &pb.CombatantInfo{}, "interrupt": &pb.Interrupt{},
	"absorbed": &pb.Absorbed{}, "companion_stats": &pb.CompanionStats{},
	"ressurection": &pb.Resurrection{}, "consume": &pb.Consume{}, "raid_group": &pb.RaidGroup{},
	"unit_position": &pb.UnitPosition{}, "unit_resources": &pb.UnitResources{},
}

type eventSegment struct {
	Encounter           string            `json:"encounter"`
	FirstTimestampMilli int64             `json:"first_timestamp_milli"`
	Events              []json.RawMessage `json:"events"`
}

func decodeEvents(data []byte, kind database.LogInstanceEventType, encounters map[uuid.UUID]string) ([]eventSegment, error) {
	template, ok := eventMessages[kind]
	if !ok {
		return nil, fmt.Errorf("unsupported event stream %q", kind)
	}
	gz, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	raw, err := io.ReadAll(gz)
	closeErr := gz.Close()
	if err != nil {
		return nil, err
	}
	if closeErr != nil {
		return nil, closeErr
	}
	segments := make([]eventSegment, 0)
	seen := make(map[uuid.UUID]bool)
	for len(raw) > 0 {
		idString, n := protowire.ConsumeString(raw)
		if n < 0 {
			return nil, protowire.ParseError(n)
		}
		raw = raw[n:]
		id, err := uuid.Parse(idString)
		if err != nil {
			return nil, err
		}
		key, ok := encounters[id]
		if !ok || seen[id] {
			return nil, fmt.Errorf("unknown or repeated encounter %s", id)
		}
		seen[id] = true
		header := [3]uint64{}
		for i := range header {
			value, n := protowire.ConsumeVarint(raw)
			if n < 0 {
				return nil, protowire.ParseError(n)
			}
			raw = raw[n:]
			header[i] = value
		}
		if header[2] > uint64(len(raw)) {
			return nil, fmt.Errorf("truncated event segment")
		}
		body := raw[:int(header[2])]
		raw = raw[int(header[2]):]
		segment := eventSegment{Encounter: key, FirstTimestampMilli: int64(header[0]), Events: make([]json.RawMessage, 0)}
		for len(body) > 0 {
			event, n := protowire.ConsumeBytes(body)
			if n < 0 {
				return nil, protowire.ParseError(n)
			}
			body = body[n:]
			msg := template.ProtoReflect().New().Interface()
			if err := proto.Unmarshal(event, msg); err != nil {
				return nil, err
			}
			if hasUnknown(msg.ProtoReflect()) {
				return nil, fmt.Errorf("unknown protobuf fields in %s", kind)
			}
			encoded, err := (protojson.MarshalOptions{UseProtoNames: true, EmitUnpopulated: true}).Marshal(msg)
			if err != nil {
				return nil, err
			}
			// protojson deliberately varies whitespace. Re-encode with sorted object keys,
			// retaining json.Number so no integers pass through float64.
			var value any
			decoder := json.NewDecoder(bytes.NewReader(encoded))
			decoder.UseNumber()
			if err := decoder.Decode(&value); err != nil {
				return nil, err
			}
			canonical, err := json.Marshal(value)
			if err != nil {
				return nil, err
			}
			segment.Events = append(segment.Events, canonical)
		}
		if uint64(len(segment.Events)) != header[1] {
			return nil, fmt.Errorf("event count mismatch")
		}
		segments = append(segments, segment)
	}
	slices.SortFunc(segments, func(a, b eventSegment) int {
		if a.Encounter < b.Encounter {
			return -1
		}
		if a.Encounter > b.Encounter {
			return 1
		}
		return 0
	})
	return segments, nil
}

func hasUnknown(message protoreflect.Message) bool {
	if len(message.GetUnknown()) > 0 {
		return true
	}
	unknown := false
	message.Range(func(field protoreflect.FieldDescriptor, value protoreflect.Value) bool {
		switch {
		case field.IsMap() && field.MapValue().Message() != nil:
			value.Map().Range(func(_ protoreflect.MapKey, v protoreflect.Value) bool {
				unknown = hasUnknown(v.Message())
				return !unknown
			})
		case field.IsList() && field.Message() != nil:
			list := value.List()
			for i := 0; i < list.Len() && !unknown; i++ {
				unknown = hasUnknown(list.Get(i).Message())
			}
		case field.Message() != nil && !field.IsMap() && !field.IsList():
			unknown = hasUnknown(value.Message())
		}
		return !unknown
	})
	return unknown
}
