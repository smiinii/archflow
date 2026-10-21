import { useState } from "react";
import {
  Box,
  Monitor,
  Container,
  Database,
  Network,
  Cpu,
  Cloud,
  CircleUser,
  Globe,
} from "lucide-react";
import { getItem, iconSource } from "../lib/catalog";
export function TechIcon({ id, size = 26 }: { id: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const item = getItem(id);
  const src = iconSource(id);
  if (src && !failed)
    return (
      <img
        className="tech-icon"
        src={src}
        width={size}
        height={size}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  const icons: Record<string, typeof Box> = {
    monitor: Monitor,
    container: Container,
    database: Database,
    network: Network,
    cpu: Cpu,
    cloud: Cloud,
    user: CircleUser,
    globe: Globe,
  };
  const Icon = icons[item.icon || ""] || Box;
  return <Icon size={size} aria-hidden="true" />;
}
