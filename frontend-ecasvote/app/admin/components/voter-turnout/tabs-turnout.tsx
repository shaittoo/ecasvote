"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import VoterTurnoutOverall from "./overall-turnout";
import VoterTurnoutBreakdown from "./breakdown-turnout";
import { useState } from "react";

type Props = {
  stats: {
    totalVoters: number;
    votedCount: number;
    notVotedCount: number;
  };
  groups: any[];
};

export default function VoterTurnoutTabs({ stats, groups }: Props) {
  const [activeTab, setActiveTab] = useState("overall");

  return (
    <Tabs defaultValue="overall" value={activeTab} onValueChange={setActiveTab}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Voter Turnout</CardTitle>

          <TabsList>
            <TabsTrigger
              value="overall"
              className={activeTab === "overall" ? "cursor-default" : "cursor-pointer"}
            >
              Overall
            </TabsTrigger>

            <TabsTrigger
              value="breakdown"
              className={activeTab === "breakdown" ? "cursor-default" : "cursor-pointer"}
            >
              Breakdown
            </TabsTrigger>
          </TabsList>
        </CardHeader>

        <CardContent>
          <TabsContent value="overall">
            <VoterTurnoutOverall {...stats} />
          </TabsContent>

          <TabsContent value="breakdown">
            <VoterTurnoutBreakdown groups={groups} />
          </TabsContent>
        </CardContent>
      </Card>
    </Tabs>
  );
}