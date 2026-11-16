# Beyond the Best Parse: Why I Introduced Ratings to Chronicle

I've seen quite a bit of feedback about Chronicle's new ratings system and the changes to the Armory. I want to take some time to address that feedback, explain the motivation behind these changes, and share where I'd like to take Chronicle.

First, **removing the old Armory view was a mistake, and I'm sorry.**

When I introduced ratings, I was focused on improving how Chronicle measures and summarizes performance. I saw the old Armory primarily as a way to aggregate parses, and I believed ratings could do that job better.

What I overlooked was that the old view served another important purpose: **it gave players visibility into their individual parses and performance history.**

That information is valuable on its own. Ratings don't replace it, and removing the view took away something people genuinely enjoyed using.

**I've since restored the old view and added parse history to the toggled view**, making that information accessible again while improving on what was there before. That change came directly from your feedback.

I also recognize that the new ratings aren't as immediately familiar or easy to understand as parses. I could have done a better job introducing the system and explaining what these numbers represent.

With that addressed, I want to explain why I introduced ratings in the first place.

## Why move beyond parses?

Parses are useful. They're familiar, competitive, and a great way to understand how a particular performance compares to others.

**What I've struggled with is using parse scores to compare players across different specializations, raids, and points in time.**

The problem isn't that parses are bad measurements. It's that their meaning depends on the players and performances included in the comparison.

This becomes particularly noticeable on the smaller private servers Chronicle supports.

Once you divide a server's population by specialization and encounter, some comparison groups can become quite small. One specialization might have hundreds of recorded performances, while another has only a fraction of that.

A 95 parse in one specialization might represent a very different competitive environment than a 95 in another. Both scores describe where those performances stand within their respective populations, but that doesn't necessarily make them directly comparable.

Smaller populations can also make these comparisons more sensitive to individual results entering or leaving the dataset.

And that brings me to another concern: **parses are relative to a changing population over a rolling 60-day window.**

Imagine your guild raids on Friday. The strongest guild on the server raids Saturday, and another guild raids Sunday.

On Friday, your performance is compared against the population available at that moment. Saturday's stronger performances haven't happened yet.

By Sunday, those performances are part of the comparison population.

Two players could deliver identical DPS but receive different parse scores simply because they raided on different days.

The same thing happens over longer periods. As performances enter and leave the 60-day window, the population changes, and so does the meaning of a particular percentile.

This isn't inherently wrong. **A parse tells you where a performance stands within a particular population at a particular time.**

That's useful information. But I wanted Chronicle to answer a different question.

## Distance from the best, rather than position in the population

The fundamental idea behind Peak is relatively simple.

Instead of asking where a performance ranks among everyone else, I wanted to measure **how close that performance came to the best recorded result** for the same specialization and encounter.

For example, imagine the highest recorded DPS for an encounter is 2,000.

If you achieve 1,600 DPS, your Peak rating is 80.

You achieved 80% of the benchmark.

It doesn't matter whether there are 50 other players below you or 5,000. As long as the benchmark remains unchanged, your distance from it remains the same.

This is the distinction I wanted to establish:

**Parses measure your position within a population. Peak measures your distance from a benchmark.**

Peak still depends on other players' performances. An exceptional new record can raise the benchmark and lower existing ratings. A small or less competitive population can also affect how representative its best recorded performance is.

It isn't a perfect measurement, and it doesn't eliminate every challenge associated with comparing different specializations.

But it removes the rolling-window limitation and offers a different basis for comparison using all eligible recorded history.

### A common scale for different performances

Another motivation was making performance easier to understand outside your own specialization.

Imagine you're a Hunter. You probably have a reasonable idea of what good Hunter DPS looks like for a particular boss.

But what if you open a Balance Druid's profile?

Their damage might be half of yours. Is that good? Bad? Exceptional for a Balance Druid?

Unless you know that specialization well, the raw DPS alone doesn't tell you much.

**By normalizing performance against specialization-specific benchmarks, I wanted to give these numbers a shared interpretation.**

If you understand what an 80 Peak means for your own specialization, you can understand what an 80 Peak means for someone else's: both performances reached 80% of their respective benchmarks.

That doesn't mean both players demonstrated identical skill, or that their encounters were equally difficult. But the numbers now answer the same question.

This extends beyond players, too.

Chronicle also applies Peak and Mastery to guild performance, using encounter and clear times rather than DPS.

The underlying calculations account for the different measurements, but the interpretation remains familiar: Peak describes proximity to the best recorded result, while Mastery considers performance across repeated attempts.

**The goal is that learning what a rating means on your own profile helps you understand what it means everywhere else on Chronicle.**

There was also a practical motivation behind this approach.

Chronicle is a project I maintain myself, including the work of investigating and correcting problematic logs.

With a benchmark-based approach, I can focus on the performances establishing the reference point for each comparison. That doesn't eliminate the need to moderate other data, but it makes maintaining the scoring reference more manageable.

I wanted a system that was straightforward to interpret, practical to maintain, and useful as Chronicle continues to grow.

## Recognizing more than one exceptional performance

Peak is only part of the system.

One thing I've always wanted Chronicle to recognize is the difference between having an incredible night and performing well consistently.

Someone might have one exceptional encounter where everything goes perfectly. Another player might perform very well across dozens of encounters without ever achieving that same peak.

Both are accomplishments, but they're different accomplishments.

That's why Mastery exists.

**Peak recognizes your best performance. Mastery considers your broader performance history.**

Mastery combines Peak with measurements of your other performances, placing more emphasis on repeatable results than a single exceptional kill.

Neither number tells the entire story of a player. They're intended to provide different perspectives on performance.


## Comparing achievements across raids and specializations

The idea of combining your best performances across multiple bosses isn't new. Other logging platforms, such as Warcraft Logs, have a similar system called **All Star Points**.

The biggest difference is how those scores are presented.

All Star Points commonly award up to 120 points per boss, accumulating points across a raid. This means the maximum possible score depends on how many bosses are included. If someone has 835 All Star Points, is that good? It's difficult to know without understanding the total possible points or comparing them against other players.

**Chronicle takes a different approach by keeping Peak and Mastery normalized to a 0–100 scale**, whether you're looking at an individual boss, an entire raid, or a Career spanning multiple raids.

A Peak rating of 90 has an intuitive meaning: you've achieved 90% of the best recorded performance relative to the relevant benchmarks.

This makes it possible to recognize achievements across specializations with vastly different damage or healing output. The same approach extends to guilds, where Peak and Mastery measure performance using encounter and clear times.

**My goal is that once you understand what a rating means on your own profile, you can understand it anywhere on Chronicle.**

## Renown: Recognizing participation

There's another part of the new system that I think deserves some attention: Renown.

Not every achievement needs to be about how much damage or healing you do.

Some players raid every week. They clear hundreds of bosses, participate in countless raids, and spend enormous amounts of time playing with their guilds.

I think that deserves recognition too.

**Renown measures how much content you've completed, rather than how well you've performed.**

The idea is fairly simple. Each eligible boss kill contributes points toward your Renown, with different encounters carrying different awards.

It's a little like DKP, except instead of spending points on loot, you're accumulating a record of your raiding history.

Unlike Peak and Mastery, Renown isn't a normalized 0–100 performance rating. It's a cumulative measure of participation.

Someone who raids consistently over a long period can build substantial Renown without ever needing to achieve an exceptional parse.

And that's intentional.

**I don't believe there's only one way to be a valuable raider.**

Exceptional performances, consistent performances, and sustained participation are all worth recognizing.

That's the broader philosophy behind introducing these different measurements rather than trying to define every player's accomplishments through one number.

## What I got wrong with the Armory

Coming back to the original feedback, I think I made a mistake in how I approached the old Armory.

I was trying to solve problems with the way Chronicle summarized performance, and I viewed the old Armory primarily through that lens.

But people weren't only using it to summarize their performance.

They were using it to explore individual parses, review their history, and understand how they performed on specific encounters.

**In trying to improve the summary, I removed access to the underlying history.**

That was the wrong decision.

I heard that feedback, and I've already made changes to address it.

**The old Armory view is back, and I've also added some new enhancements.** So this wasn't simply a rollback. I wanted to restore the information people valued while making it easier to explore their individual performances.

I think that distinction matters because ratings and parse history should complement each other, not compete for space.

And now that ratings can answer many of the broader performance questions I was previously trying to answer through the Armory, I actually see an opportunity to improve parse history further.

Rather than asking one interface to summarize everything, I'd like to eventually make the parse-history view more focused on exploring individual performances, tracking progress, and understanding what happened across different encounters.

There's a lot of potential there.

Unfortunately, I don't currently have the time to properly rethink and rebuild that experience in the near term. Chronicle is something I develop and maintain in my spare time, and I don't want to rush into another redesign without thinking through how people actually use it.

For now, I hope the restored and enhanced views address the most immediate concerns.

Longer term, I'd like to build upon them and give players even more insight into their parses.

## Moving forward

I still believe in the direction behind ratings.

I think there's genuine value in moving beyond individual parses and giving players more ways to understand their performance and recognize their achievements.

But that doesn't mean the current system is perfect.

There are trade-offs in how benchmarks are established, how performances are combined, and how different specializations are compared. Those are all things worth examining and improving.

And even a well-designed rating is of limited use if people can't understand what it means.

I want Chronicle to remain approachable, transparent, and useful, whether you're competing for the highest possible parse, trying to improve your consistency, or simply enjoying raiding with your guild.

I appreciate everyone who has taken the time to share feedback, especially when something I've changed has made the site less useful for them.

My goal with ratings was never to take something away.

**It was to give players more ways to understand and celebrate what they've accomplished.**

I still believe that's a worthwhile goal, and I want to keep improving how Chronicle gets there.

Thanks for being part of the project.

— Steven