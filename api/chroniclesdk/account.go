package chroniclesdk

type AccountDeletionStatus struct {
	CanDelete bool     `json:"can_delete"`
	Blockers  []string `json:"blockers"`
}

type DeleteAccountRequest struct {
	Confirmation string `json:"confirmation"`
}
