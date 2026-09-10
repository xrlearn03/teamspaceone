import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { TrustedBy } from "./components/TrustedBy";
import { Intro } from "./components/Intro";
import { Stats } from "./components/Stats";
import { Features } from "./components/Features";
import { Collaboration } from "./components/Collaboration";
import { HRMS } from "./components/HRMS";
import { AIInterview } from "./components/AIInterview";
import { WhyTeamspace } from "./components/WhyTeamspace";
import { Testimonials } from "./components/Testimonials";
import { FAQ } from "./components/FAQ";
import { DownloadCTA } from "./components/DownloadCTA";
import { Footer } from "./components/Footer";

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <TrustedBy />
        <Intro />
        <Stats />
        <Features />
        <Collaboration />
        <HRMS />
        <AIInterview />
        <WhyTeamspace />
        <Testimonials />
        <FAQ />
        <DownloadCTA />
      </main>
      <Footer />
    </>
  );
}
