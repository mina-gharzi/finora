import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export interface IconProps {
  name: IconName;
  size?: number;
  color: string;
}

export function Icon({ name, size = 20, color }: IconProps) {
  return <Ionicons name={name} size={size} color={color} />;
}
