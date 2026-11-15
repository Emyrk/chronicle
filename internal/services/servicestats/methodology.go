package servicestats

import "fmt"

// methodologyPage explains how every /stats number is computed. Every page's
// methodology link points here.
func methodologyPage() StaticPage {
	return StaticPage{
		Path: MethodologyPath,
		Render: func(site Site) Content {
			label := site.Label()
			return Content{
				Title: fmt.Sprintf("How does Chronicle compute its %s stats?", label),
				Lead: fmt.Sprintf("Chronicle's %s stats count raids, kills and players seen in the combat logs that players upload to Chronicle. "+
					"They are not the server's population, and each page shows when it was last computed and how many records it rests on.", label),
				Sections: []Section{
					{
						Heading: "Where the numbers come from",
						Paragraphs: []string{
							"Every number comes from combat logs uploaded to Chronicle. Only listed logs count; unlisted uploads and logs an admin invalidated are excluded.",
							"A raid uploaded by several players counts once. Player counts are distinct characters seen in those logs, so they undercount everyone who plays on the server.",
							"The class and race census counts each character once per window (30 and 90 days). A character seen only in unlisted or invalidated logs is left out; faction is the one the log recorded, or the race's faction when it did not.",
						},
					},
					{
						Heading: "Freshness and sample size",
						Paragraphs: []string{
							"Pages are recomputed in the background several times a day. The \"Updated\" line shows when, and the sample size shows how many records the numbers rest on.",
							"Pages with too few records still load but are kept out of search engines, and servers need a minimum amount of logged raiding before they get stats pages at all.",
						},
					},
				},
				Links: []Link{
					{Text: "Upload your logs", Href: "/upload"},
					{Text: "Recent raids", Href: "/recent"},
				},
			}
		},
	}
}
