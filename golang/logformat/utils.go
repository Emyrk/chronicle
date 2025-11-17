package logformat

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// CreateZipFile creates a zip archive containing the specified source file
func CreateZipFile(sourceFile, zipFilename string) error {
	zipFile, err := os.Create(zipFilename)
	if err != nil {
		return fmt.Errorf("error creating zip file: %w", err)
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	// Open the source file
	file, err := os.Open(sourceFile)
	if err != nil {
		return fmt.Errorf("error opening source file: %w", err)
	}
	defer file.Close()

	// Get file info
	info, err := file.Stat()
	if err != nil {
		return fmt.Errorf("error getting file info: %w", err)
	}

	// Create zip header
	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return fmt.Errorf("error creating zip header: %w", err)
	}

	header.Name = filepath.Base(sourceFile)
	header.Method = zip.Deflate

	// Create writer for file in zip
	writer, err := zipWriter.CreateHeader(header)
	if err != nil {
		return fmt.Errorf("error creating zip writer: %w", err)
	}

	// Copy file contents to zip
	if _, err := io.Copy(writer, file); err != nil {
		return fmt.Errorf("error writing to zip: %w", err)
	}

	return nil
}

// GenerateOutputFilename generates an output filename based on input and options
func GenerateOutputFilename(inputFilename string, rename bool) string {
	if rename {
		// Generate TurtLog-YYYY-MM-DDTHH-MM.txt format
		timestamp := time.Now().Format("2006-01-02T15-04")
		return fmt.Sprintf("TurtLog-%s.txt", timestamp)
	}

	// Default: add .formatted.txt to the input filename
	ext := filepath.Ext(inputFilename)
	if ext == ".txt" {
		base := inputFilename[:len(inputFilename)-len(ext)]
		return base + ".formatted.txt"
	}

	return inputFilename + ".formatted.txt"
}

// FormatOptions contains configuration options for formatting
type FormatOptions struct {
	PlayerName     string
	InputFilename  string
	OutputFilename string
	CreateZip      bool
	Rename         bool
}

// ProcessLogFile is a convenience function that handles the entire formatting workflow
func ProcessLogFile(opts FormatOptions) (string, error) {
	// Create formatter
	formatter := NewFormatter(opts.PlayerName)

	// Determine output filename
	outputFilename := opts.OutputFilename
	if outputFilename == "" {
		outputFilename = GenerateOutputFilename(opts.InputFilename, false)
	}

	// Format the file
	if err := formatter.FormatFile(opts.InputFilename, outputFilename); err != nil {
		return "", fmt.Errorf("error formatting file: %w", err)
	}

	// Apply rename if requested
	resultFilename := outputFilename
	if opts.Rename {
		newFilename := GenerateOutputFilename(opts.InputFilename, true)
		if err := os.Rename(outputFilename, newFilename); err != nil {
			return "", fmt.Errorf("error renaming output file: %w", err)
		}
		resultFilename = newFilename
	}

	// Create zip if requested
	if opts.CreateZip {
		zipFilename := resultFilename + ".zip"
		if err := CreateZipFile(resultFilename, zipFilename); err != nil {
			return "", fmt.Errorf("error creating zip file: %w", err)
		}
		fmt.Printf("Created zip file: %s\n", zipFilename)
	}

	return resultFilename, nil
}
