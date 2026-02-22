"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import VoterTurnoutOverall from "./overall-turnout";
import VoterTurnoutBreakdown from "./breakdown-turnout";

type Props = {
  stats: {
    totalVoters: number;
    votedCount: number;
    notVotedCount: number;
  };
  groups: any[];
};

export default function VoterTurnoutTabs({ stats, groups }: Props) {
  return (
    <Tabs defaultValue="overall">
      <Card>
        {/* Header */}
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Voter Turnout</CardTitle>

          <TabsList>
            <TabsTrigger value="overall">Overall</TabsTrigger>
            <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          </TabsList>
        </CardHeader>

        {/* Body */}
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