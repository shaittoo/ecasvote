"use client";

import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: number;
  color?: string; 
}

export default function StatCard({ title, value, color = "text-gray-700" }: StatCardProps) {
  return (
    <Card>
      <CardContent className="py-6 flex flex-col items-center justify-center">
        <div className={`text-4xl font-bold ${color}`}>{value}</div>
        <div className="text-sm text-gray-700 mt-1">{title}</div>
      </CardContent>
    </Card>
  );
}