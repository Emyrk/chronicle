package chroniclesdk

import (
  "encoding/json"

  "github.com/google/uuid"
)

type CreateShareRequest struct {
  InstanceID uuid.UUID       `json:"instance_id"`
  Payload    json.RawMessage `json:"payload"`
}

type CreateShareResponse struct {
  Code string `json:"code"`
  URL  string `json:"url"`
}

type SharedViewResponse struct {
  InstanceID uuid.UUID       `json:"instance_id"`
  Payload    json.RawMessage `json:"payload"`
}
