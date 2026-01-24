import React from "react";
import CreditsQuery from "./components/CreditsQuery";
import Proposals from "./components/Proposals";

export default function App() {
  return (
    <div className="container">
      <div className="stack">
        <CreditsQuery />
        <Proposals />
      </div>
    </div>
  );
}

