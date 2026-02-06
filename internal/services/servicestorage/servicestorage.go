package servicestorage

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func Storage(broker *services.Services) storage.ObjectStorage {
	srv := services.MustGet[*Service](broker)
	return srv.st
}

func OnStorage() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services
	st     storage.ObjectStorage

	storageType       string
	s3Region          string
	s3Endpoint        string
	s3AccessKey       string
	s3SecretKey       string
	s3UsePathStyle    bool
	s3Bucket          string
	supabaseProjectID string
	supabaseAPIKey    string
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string {
	return services.ServiceStorage
}
func (s *Service) Configures() []string { return []string{} }
func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
	}
}

func (s *Service) Start(ctx context.Context) error {
	logger := servicelogger.Logger(s.broker).With(slog.String("storage_type", s.storageType))
	var files storage.ObjectStorage
	var err error

	switch s.storageType {
	case "local":
		files, err = storage.NewLocalStorage()
		if err != nil {
			return fmt.Errorf("provision local storage: %w", err)
		}
	case "s3":
		files, err = storage.NewS3Storage(ctx, storage.S3Options{
			Region:          s.s3Region,
			Endpoint:        s.s3Endpoint,
			AccessKeyID:     s.s3AccessKey,
			SecretAccessKey: s.s3SecretKey,
			UsePathStyle:    s.s3UsePathStyle,
			Bucket:          s.s3Bucket,
		})
		if err != nil {
			return fmt.Errorf("provision S3 storage: %w", err)
		}
	case "supabase":
		files, err = storage.NewSupabaseStorage(s.supabaseProjectID, s.supabaseAPIKey)
		if err != nil {
			return fmt.Errorf("provision Supabase storage: %w", err)
		}
	default:
		return fmt.Errorf("unknown storage type: %s (valid: local, s3, supabase)", s.storageType)
	}

	logger.Info("Storage service initialized successfully")
	s.st = files
	return nil
}

func (s *Service) Close(_ context.Context) error {
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "Storage Type",
			Description: "Storage backend to use: 'local', 's3', or 'supabase'.",
			Required:    false,
			Flag:        "storage-type",
			Env:         "CHRONICLE_STORAGE_TYPE",
			Default:     "local",
			Value:       serpent.StringOf(&s.storageType),
		},
		{
			Name:        "S3 Region",
			Description: "AWS S3 region (e.g., 'us-east-1').",
			Required:    false,
			Flag:        "s3-region",
			Env:         "CHRONICLE_S3_REGION",
			Default:     "",
			Value:       serpent.StringOf(&s.s3Region),
		},
		{
			Name:        "S3 Endpoint",
			Description: "Custom S3 endpoint URL (for S3-compatible services like MinIO).",
			Required:    false,
			Flag:        "s3-endpoint",
			Env:         "CHRONICLE_S3_ENDPOINT",
			Default:     "",
			Value:       serpent.StringOf(&s.s3Endpoint),
		},
		{
			Name:        "S3 Access Key",
			Description: "AWS S3 access key ID.",
			Required:    false,
			Flag:        "s3-access-key",
			Env:         "CHRONICLE_S3_ACCESS_KEY",
			Default:     "",
			Value:       serpent.StringOf(&s.s3AccessKey),
		},
		{
			Name:        "S3 Secret Key",
			Description: "AWS S3 secret access key.",
			Required:    false,
			Flag:        "s3-secret-key",
			Env:         "CHRONICLE_S3_SECRET_KEY",
			Default:     "",
			Value:       serpent.StringOf(&s.s3SecretKey),
		},
		{
			Name:        "S3 Path Style",
			Description: "Use path-style addressing (required for MinIO and some S3-compatible services).",
			Required:    false,
			Flag:        "s3-path-style",
			Env:         "CHRONICLE_S3_PATH_STYLE",
			Default:     "false",
			Value:       serpent.BoolOf(&s.s3UsePathStyle),
		},
		{
			Name:        "S3 Bucket",
			Description: "Single bucket name for S3-compatible services (Railway/Tigris). When set, bucket IDs become key prefixes.",
			Required:    false,
			Flag:        "s3-bucket",
			Env:         "CHRONICLE_S3_BUCKET",
			Default:     "",
			Value:       serpent.StringOf(&s.s3Bucket),
		},
		{
			Name:        "Supabase Project ID",
			Description: "Supabase project ID for storage.",
			Required:    false,
			Flag:        "supabase-project-id",
			Env:         "CHRONICLE_SUPABASE_PROJECT_ID",
			Default:     "",
			Value:       serpent.StringOf(&s.supabaseProjectID),
		},
		{
			Name:        "Supabase API Key",
			Description: "Supabase API key for storage.",
			Required:    false,
			Flag:        "supabase-api-key",
			Env:         "CHRONICLE_SUPABASE_API_KEY",
			Default:     "",
			Value:       serpent.StringOf(&s.supabaseAPIKey),
		},
	}
}
