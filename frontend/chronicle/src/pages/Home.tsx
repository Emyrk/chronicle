import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Users, Shield, User, Upload, Eye, Share2 } from "lucide-react";

export function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section 
        className="relative py-20 md:py-32 px-6 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/herobackground.avif')" }}
      >
        {/* Overlay for text readability */}
        <div className="absolute inset-0 bg-background/80" />
        
        <div className="relative max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Every raid tells a story.
            <br />
            <span className="text-sky-400">Chronicle helps you read it.</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Chronicle analyzes your logs and presents the results in a way that's easy to read, 
            easy to share, and useful for raid leadership.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
            <Button asChild size="lg">
              <Link to="/logs">View a Sample Guild</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/upload">How to do this for your next raid</Link>
            </Button>
          </div>
          
          <p className="text-sm text-muted-foreground">
            No account required. All guild pages are public.
          </p>
        </div>
      </section>

      {/* What Chronicle Does */}
      <section className="py-16 md:py-24 px-6 bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <p className="text-lg md:text-xl leading-relaxed mb-6">
            Chronicle takes raw combat logs and turns them into summaries that answer practical 
            questions leaders care about:
          </p>
          
          <ul className="space-y-3 mb-6 text-lg">
            <li className="flex items-start gap-3">
              <span className="text-primary mt-1">•</span>
              <span>Who contributed, and how</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-primary mt-1">•</span>
              <span>What resources were used</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-primary mt-1">•</span>
              <span>Where time or efficiency was lost</span>
            </li>
          </ul>
          
          <p className="text-muted-foreground text-lg">
            It's built for reviewing raids and having clearer conversations—not digging through 
            dense tables or ranking players.
          </p>
        </div>
      </section>

      {/* Who This is For */}
      <section className="py-16 md:py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            Built for those who lead in the moment and learn from the chronicle.
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Raid Leaders */}
            <div className="text-center p-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-4">
                <Users className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Raid Leaders</h3>
              <p className="text-muted-foreground">
                Coach more effectively with fast, interpretable insight that highlights where 
                improvements matter most.
              </p>
            </div>
            
            {/* Guild Masters */}
            <div className="text-center p-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-4">
                <Shield className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Guild Masters</h3>
              <p className="text-muted-foreground">
                Use Chronicle as a transparent record of performance and progression.
              </p>
            </div>
            
            {/* Individual Players */}
            <div className="text-center p-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-4">
                <User className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Individual Players</h3>
              <p className="text-muted-foreground">
                See how individual actions contribute to group success.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="py-16 md:py-24 px-6 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            Raid Night Doesn't End at the Last Pull
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1: Upload */}
            <div className="relative p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold">
                  1
                </div>
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Upload the raid log</h3>
              <p className="text-muted-foreground">
                Capture the full run once the night wraps up, while it's still fresh.
              </p>
            </div>
            
            {/* Step 2: Review */}
            <div className="relative p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold">
                  2
                </div>
                <Eye className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Review what happened together</h3>
              <p className="text-muted-foreground">
                See contributions, resource use, and where time was gained or lost.
              </p>
            </div>
            
            {/* Step 3: Share */}
            <div className="relative p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold">
                  3
                </div>
                <Share2 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Share the chronicle</h3>
              <p className="text-muted-foreground">
                Use it as a shared reference for discussion and improvement.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="py-16 md:py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <Button asChild size="lg">
            <Link to="/logs">Browse Chronicle</Link>
          </Button>
          <p className="mt-4 text-muted-foreground">
            Look through real guild pages before uploading anything.
          </p>
        </div>
      </section>
    </div>
  );
}
