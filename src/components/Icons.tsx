import { useEffect, useState } from "react";
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
export function TechIcon({
  id,
  size = 26,
  onUnavailable,
}: {
  id: string;
  size?: number;
  onUnavailable?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id]);
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
        onError={() => {
          setFailed(true);
          onUnavailable?.();
        }}
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
  return (
    <Icon size={size} aria-hidden="true">
      <title>
        {failed ? `${item.title} 아이콘을 불러오지 못했습니다.` : item.title}
      </title>
    </Icon>
  );
}
