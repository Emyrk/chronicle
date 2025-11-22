package vanillaparser

import (
	"fmt"
	"regexp"

	"github.com/Emyrk/chronicle/golang/wowlogs/types"
)

type replacement struct {
	re          *regexp.Regexp
	replacement string
}

var (
	youReplacements = []replacement{
		{regexp.MustCompile(`.*You fail to cast.*.`), ""},
		{regexp.MustCompile(`.*You fail to perform.*.`), ""},
		{regexp.MustCompile(` You suffer (.*?) from your`), ` %[1]s suffers %[2]s from %[1]s (self damage)'s`},
		{regexp.MustCompile(` Your (.*?) hits you for`), ` %[1]s (self damage)'s %[2]s hits %[1]s for`},
		{regexp.MustCompile(` Your (.*?) is parried by`), ` %[1]s's %[2]s was parried by`},
		{regexp.MustCompile(` Your (.*?) failed`), ` %[1]s's %[2]s fails`},
		{regexp.MustCompile(` failed\. You are immune`), ` fails. %[1]s is immune`},
		{regexp.MustCompile(` [Yy]our `), ` %[1]s's `},
		{regexp.MustCompile(` You gain (.*?) from (.*?)'s`), ` %[1]s gains %[2]s from %[3]s's`},
		{regexp.MustCompile(` You gain (.*?) from `), ` %[1]s gains %[2]s from %[1]s's `},
		{regexp.MustCompile(` you gain`), ` %[1]s gains`},
		{regexp.MustCompile(` You gain`), ` %[1]s gains`},
		{regexp.MustCompile(` You hit`), ` %[1]s hits`},
		{regexp.MustCompile(` You crit`), ` %[1]s crits`},
		{regexp.MustCompile(` You are`), ` %[1]s is`},
		{regexp.MustCompile(` You suffer`), ` %[1]s suffers`},
		{regexp.MustCompile(` You lose`), ` %[1]s loses`},
		{regexp.MustCompile(` You die`), ` %[1]s dies`},
		{regexp.MustCompile(` You cast`), ` %[1]s casts`},
		{regexp.MustCompile(` You create`), ` %[1]s creates`},
		{regexp.MustCompile(` You perform`), ` %[1]s performs`},
		{regexp.MustCompile(` You interrupt`), ` %[1]s interrupts`},
		{regexp.MustCompile(` You miss`), ` %[1]s misses`},
		{regexp.MustCompile(` You attack`), ` %[1]s attacks`},
		{regexp.MustCompile(` You block`), ` %[1]s blocks`},
		{regexp.MustCompile(` You parry`), ` %[1]s parries`},
		{regexp.MustCompile(` You dodge`), ` %[1]s dodges`},
		{regexp.MustCompile(` You resist`), ` %[1]s resists`},
		{regexp.MustCompile(` You absorb`), ` %[1]s absorbs`},
		{regexp.MustCompile(` You reflect`), ` %[1]s reflects`},
		{regexp.MustCompile(` You receive`), ` %[1]s receives`},
		{regexp.MustCompile(`&You receive`), `&%[1]s receives`},
		{regexp.MustCompile(` You deflect`), ` %[1]s deflects`},
		{regexp.MustCompile(`was dodged\.`), `was dodged by %[1]s.`},
		{regexp.MustCompile(`causes you`), `causes %[1]s`},
		{regexp.MustCompile(`heals you`), `heals %[1]s`},
		{regexp.MustCompile(`hits you for`), `hits %[1]s for`},
		{regexp.MustCompile(`crits you for`), `crits %[1]s for`},
		{regexp.MustCompile(` You have slain (.*?)!`), ` %[2]s is slain by %[1]s.`},
		{regexp.MustCompile(`(\S)\s+you\.`), `%[2]s %[1]s.`},
		{regexp.MustCompile(` You fall and lose`), ` %[1]s falls and loses`},
	}
)

func (s *State) Preprocess(content string) (string, error) {
	fixed, ok, err := s.youReplace(content)
	if err != nil {
		return "", err
	}
	if ok {
		// When casting on yourself, you need 2 replacements
		fixed, _, err = s.youReplace(fixed)
		if err != nil {
			return "", err
		}

		return fixed, nil
	}

	return content, nil
}

func (s *State) youReplace(content string) (string, bool, error) {
	if len(content) == 0 {
		return content, false, nil
	}

	trim := false
	if content[0] != ' ' {
		content = " " + content
		trim = true
	}

	// Is prepending this space costly? It simplifies the regex...
	fix := func(s string) string {
		if trim && len(s) > 0 {
			return s[1:]
		}
		return s
	}

	for _, rpl := range youReplacements {
		re, replace := rpl.re, rpl.replacement
		replaced, ok, err := s.replacer(re, content, replace)
		if err != nil {
			return fix(content), ok, err
		}

		if ok {
			return fix(replaced), ok, nil
		}
	}
	return fix(content), false, nil
}

func (s *State) replacer(re *regexp.Regexp, content string, replacement string) (string, bool, error) {
	matches, ok := types.FromRegex(re).Match(content)
	if !ok {
		return content, false, nil
	}

	if s.Me.Gid.IsZero() {
		return content, false, fmt.Errorf("cannot perform 'you' replacement without a defined player unit")
	}

	if replacement == "" {
		// Quicker replacement for lines to remove
		return "", true, nil
	}

	matchesArgs := matches.Rest()
	args := make([]any, len(matchesArgs)+1)
	args[0] = s.Me.Gid.String()
	for i := range matchesArgs {
		args[i+1] = matchesArgs[i]
	}

	return re.ReplaceAllString(content, fmt.Sprintf(replacement, args...)), true, nil
}
