export function Privacy() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>

      {/* Short Version */}
      <section className="mb-8 p-4 bg-muted/30 rounded-lg">
        <h2 className="text-xl font-semibold mb-3">The Short Version</h2>
        <p className="text-muted-foreground mb-3">
          Chronicle analyzes World of Warcraft raid logs.
        </p>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-3">
          <li>Guild pages are public by design.</li>
          <li>Guild leadership controls uploads.</li>
          <li>We don't sell your data.</li>
          <li>We don't use raid data for ads.</li>
          <li>We collect only what we need to run the service.</li>
        </ul>
        <p className="text-muted-foreground">
          If you use Chronicle, you agree to this policy.
        </p>
      </section>

      {/* What We Collect */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">What We Collect</h2>

        <div className="space-y-6">
          <div>
            <h3 className="font-medium mb-2">1. Account Information</h3>
            <p className="text-muted-foreground mb-2">
              If you create an account, we may collect:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-2">
              <li>Your email address</li>
              <li>Your username</li>
              <li>Your guild association</li>
              <li>Basic account settings</li>
            </ul>
            <p className="text-muted-foreground">
              This helps us manage log uploads and account access.
            </p>
          </div>

          <div>
            <h3 className="font-medium mb-2">2. Raid Log Data</h3>
            <p className="text-muted-foreground mb-2">
              Guild leaders upload raid logs. Those logs may include:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-2">
              <li>Character names</li>
              <li>Class/spec</li>
              <li>Damage and healing numbers</li>
              <li>Consumable usage</li>
              <li>Raid dates and encounter details</li>
            </ul>
            <p className="text-muted-foreground">
              This is <strong>in-game data only</strong>. We do not collect
              real-world personal details from log files.
            </p>
          </div>

          <div>
            <h3 className="font-medium mb-2">3. Public Guild Pages</h3>
            <p className="text-muted-foreground mb-2">
              Guild pages are public. They may display:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-2">
              <li>Guild name</li>
              <li>Raid history</li>
              <li>Character names</li>
              <li>Performance metrics</li>
              <li>Analytical insights</li>
            </ul>
            <p className="text-muted-foreground mb-2">
              Chronicle is designed to make raid data shareable and readable.
            </p>
            <p className="text-muted-foreground">
              If you do not want your character data shown, talk to your guild
              leadership before logs are uploaded.
            </p>
          </div>

          <div>
            <h3 className="font-medium mb-2">4. Technical Information</h3>
            <p className="text-muted-foreground mb-2">
              Like most websites, we automatically collect basic technical data
              such as:
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-2">
              <li>IP address</li>
              <li>Browser type</li>
              <li>Device type</li>
              <li>Pages visited</li>
              <li>Error logs</li>
            </ul>
            <p className="text-muted-foreground mb-2">
              We use this to keep the site secure, fix bugs, and improve
              performance.
            </p>
            <p className="text-muted-foreground">
              Chronicle also uses a first-party visitor cookie to provide guild
              administrators with approximate, aggregate page and raid-log view
              counts. The cookie contains a random identifier, not your account
              identity, and is not used for authentication.
            </p>
          </div>
        </div>
      </section>

      {/* How We Use Your Information */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          How We Use Your Information
        </h2>
        <p className="text-muted-foreground mb-2">We use data to:</p>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-3">
          <li>Analyze raid logs</li>
          <li>Display guild performance</li>
          <li>Maintain accounts</li>
          <li>Improve Chronicle</li>
          <li>Keep the system secure</li>
        </ul>
        <p className="text-muted-foreground">
          We do <strong>not</strong> sell your data. We do <strong>not</strong>{" "}
          use raid data for advertising.
        </p>
      </section>

      {/* Who Controls the Data */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Who Controls the Data?</h2>
        <p className="text-muted-foreground mb-2">
          Players control their own logs.
        </p>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-3">
          <li>Only the uploader can submit a log.</li>
          <li>Uploaders decide which logs are shared on Chronicle.</li>
          <li>Guild pages display the logs that players choose to upload.</li>
        </ul>
        <p className="text-muted-foreground mb-2">
          Chronicle does not upload logs automatically and does not pull data
          directly from the game server.
        </p>
        <p className="text-muted-foreground">
          If a player wants a log removed that they uploaded, they may request
          its deletion.
        </p>
      </section>

      {/* How Long We Keep Data */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">How Long We Keep Data</h2>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>Logs stay available while the guild keeps them on Chronicle.</li>
          <li>Account data remains while your account is active.</li>
          <li>
            Some technical logs may be kept briefly for security and stability.
          </li>
        </ul>
      </section>

      {/* Security */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Security</h2>
        <p className="text-muted-foreground mb-2">
          We use standard security practices:
        </p>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-2">
          <li>Encrypted connections (HTTPS)</li>
          <li>Controlled access</li>
          <li>Secure authentication</li>
        </ul>
        <p className="text-muted-foreground">
          No system is perfect, but we take reasonable steps to protect your
          data.
        </p>
      </section>

      {/* Third-Party Services */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Third-Party Services</h2>
        <p className="text-muted-foreground mb-2">
          We use hosting and infrastructure providers to run Chronicle. They
          only process data as needed to operate the service.
        </p>
        <p className="text-muted-foreground">
          We do not share raid data for marketing purposes.
        </p>
      </section>

      {/* Children */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Children</h2>
        <p className="text-muted-foreground">
          Chronicle is intended for World of Warcraft players and guild
          leadership. We do not knowingly collect personal data from children
          under 13.
        </p>
      </section>

      {/* International Use */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">International Use</h2>
        <p className="text-muted-foreground">
          Your data may be processed in countries outside your own. By using
          Chronicle, you agree to that processing.
        </p>
      </section>

      {/* Changes */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Changes</h2>
        <p className="text-muted-foreground mb-2">
          Chronicle is evolving. If we update this policy, we will change the
          "Last Updated" date.
        </p>
        <p className="text-muted-foreground">
          Continuing to use Chronicle means you accept the updated version.
        </p>
      </section>
    </div>
  );
}
