package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/Emyrk/chronicle/golang/logformat"
)

func main() {
	// Define command-line flags
	playerName := flag.String("p", "", "Player name to replace \"You/Your\" references (required)")
	playerNameLong := flag.String("player-name", "", "Player name to replace \"You/Your\" references (required)")
	filename := flag.String("f", "WoWCombatLog.txt", "Input log filename")
	filenameLong := flag.String("filename", "WoWCombatLog.txt", "Input log filename")
	output := flag.String("o", "", "Output file path (default: input filename + .formatted.txt)")
	outputLong := flag.String("output", "", "Output file path (default: input filename + .formatted.txt)")
	createZip := flag.Bool("zip", false, "Create zip file of the output")
	rename := flag.Bool("rename", false, "Rename output to TurtLog-{timestamp}.txt")
	help := flag.Bool("h", false, "Show help")
	helpLong := flag.Bool("help", false, "Show help")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s [options]\n\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "Format WoW combat log for upload by replacing 'You/Your' with player name.\n\n")
		fmt.Fprintf(os.Stderr, "Options:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nExamples:\n")
		fmt.Fprintf(os.Stderr, "  %s -p PlayerName\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "  %s -p PlayerName -o output.txt\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "  %s -p PlayerName -f CustomLog.txt --rename --zip\n", os.Args[0])
	}

	flag.Parse()

	// Show help if requested
	if *help || *helpLong {
		flag.Usage()
		os.Exit(0)
	}

	// Get player name (prefer long form)
	player := *playerNameLong
	if player == "" {
		player = *playerName
	}

	// Validate required arguments
	if player == "" {
		fmt.Fprintf(os.Stderr, "Error: player name is required\n\n")
		flag.Usage()
		os.Exit(1)
	}

	// Get input filename
	inputFile := *filenameLong
	if flag.Lookup("f").Value.String() != "WoWCombatLog.txt" {
		inputFile = *filename
	}

	// Get output filename
	outputFile := *outputLong
	if outputFile == "" {
		outputFile = *output
	}

	// Process the log file
	opts := logformat.FormatOptions{
		PlayerName:     player,
		InputFilename:  inputFile,
		OutputFilename: outputFile,
		CreateZip:      *createZip,
		Rename:         *rename,
	}

	resultFilename, err := logformat.ProcessLogFile(opts)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Messages with You/Your have been converted to %s. Output written to: %s\n", player, resultFilename)
}
