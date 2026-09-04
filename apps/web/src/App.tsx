import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { Intro } from "./components/Intro";
import { Features } from "./components/Features";
import { Collaboration } from "./components/Collaboration";
import { WhyTeamspace } from "./components/WhyTeamspace";
import { DownloadCTA } from "./components/DownloadCTA";
import { Footer } from "./components/Footer";

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Intro />
        <Features />
        <Collaboration />
        <WhyTeamspace />
        <DownloadCTA />
      </main>
      <Footer />
    </>
  );
}
