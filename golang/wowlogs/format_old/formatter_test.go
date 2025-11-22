package format_old_test

import (
  "bufio"
  "fmt"
  "os"
  "path/filepath"
  "regexp"
  "slices"
  "strings"
  "testing"

  "github.com/Emyrk/chronicle/golang/wowlogs/format"
  "github.com/stretchr/testify/require"
)

func TestRemoveFailures(t *testing.T) {
  t.Parallel()

  line := "11/17 16:37:17.241  You fail to cast Shadow Bolt: Interrupted."
  re := regexp.MustCompile(`.*You fail to cast.*\n`)
  is := re.MatchString(line)
  fmt.Println(is)

  formatter := format_old.NewFormatter("Testplayer")
  output := formatter.FormatLine("11/17 16:37:17.241  You fail to cast Shadow Bolt: Interrupted.")
  require.Empty(t, output, "Expected failure line to be removed")
}

func TestAgainstGoldenFiles(t *testing.T) {
  t.Parallel()

  // Open all directory files in testdata/
  entries, err := os.ReadDir("testdata")
  require.NoError(t, err)

  for _, ent := range entries {
    if !ent.IsDir() {
      continue
    }

    dirPath := filepath.Join("testdata", ent.Name())
    files, err := os.ReadDir(dirPath)
    require.NoError(t, err)

    isTest := slices.ContainsFunc(files, func(e os.DirEntry) bool {
      return e.Name() == "WoWCombatLog.txt"
    })
    if !isTest {
      continue
    }

    t.Run(ent.Name(), func(t *testing.T) {
      inputPath := filepath.Join(dirPath, "WoWCombatLog.txt")
      expectedPath := filepath.Join(dirPath, "WoWCombatLog.formatted.txt")

      expectedData, err := os.ReadFile(expectedPath)
      require.NoError(t, err)

      inputFile, err := os.OpenFile(inputPath, os.O_RDONLY, 0644)
      require.NoError(t, err)
      got := []string{}

      formatter := format_old.NewFormatter("Testplayer")
      scanner := bufio.NewScanner(inputFile)
      for scanner.Scan() {
        line := scanner.Text()
        got = append(got, formatter.FormatLine(line))
      }

      _ = inputFile.Close()
      gotText := strings.Join(got, "\n")

      writeTo := filepath.Join(dirPath, "WoWCombatLog.formatted.txt.actual")
      _ = os.WriteFile(filepath.Join(dirPath, "WoWCombatLog.formatted.txt.actual"), []byte(gotText), 0644)

      t.Log("code --diff " + expectedPath + " " + writeTo)
      require.Equal(t, string(expectedData), gotText)
    })
  }
}
