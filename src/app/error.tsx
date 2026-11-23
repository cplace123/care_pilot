"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="chooser"><h1>We couldn’t load this page.</h1><p className="lead">Please try again. If the problem continues, contact your administrator.</p><button className="button primary" onClick={reset}>Try again</button></main>; }
