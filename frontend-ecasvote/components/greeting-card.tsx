"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface GreetingCardProps {
  name: string;
  role: string;
  roleColor?: string;
  description?: string;
  hasVoted?: boolean;
}

export default function GreetingCard({
  name,
  role,
  roleColor,
  description = "Welcome to UPV CAS Student Council's Online Voting System",
  hasVoted,
}: GreetingCardProps) {
  const badgeClass = hasVoted
    ? "bg-green-600 text-white"
    : roleColor
    ? `bg-[${roleColor}] text-white`
    : "bg-gray-200 text-gray-800";

  return (
    <Card>
      <CardHeader>
        <div className={`flex items-center justify-between gap-2`}>
          <CardTitle>Hello, {name}!</CardTitle>
          <Badge
            variant="secondary"
            className={hasVoted !== undefined ? badgeClass : `bg-[${roleColor}] text-white`}
          >
            {hasVoted !== undefined ? (hasVoted ? "Voted" : "Not Voted") : role}
          </Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}