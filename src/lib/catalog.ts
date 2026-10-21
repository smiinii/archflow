import raw from "../data/catalog.json";
export type CatalogItem = {
  id: string;
  title: string;
  name: string;
  provider: string;
  category: string;
  icon?: string;
  src?: string;
  asset?: string;
  keywords?: string;
  structural?: boolean;
};
const basic: Record<string, Omit<CatalogItem, "id">> = {
  "tech-firebase": {
    title: "Firebase",
    name: "Firebase",
    provider: "backend",
    category: "플랫폼",
    asset: "firebase",
    keywords: "파이어베이스",
  },
  "tech-fcm": {
    title: "Firebase Cloud Messaging",
    name: "푸시 알림",
    provider: "backend",
    category: "메시징",
    asset: "fcm",
    keywords: "FCM Firebase 푸시 알림 파이어베이스",
  },
  "tech-slack": {
    title: "Slack",
    name: "운영 알림",
    provider: "backend",
    category: "운영",
    asset: "slack",
    keywords: "슬랙 알림 웹훅",
  },
  client: {
    title: "Browser",
    name: "사용자",
    provider: "basic",
    category: "진입",
    icon: "monitor",
  },
  nginx: {
    title: "Nginx",
    name: "진입 프록시",
    provider: "basic",
    category: "네트워크",
    asset: "nginx",
  },
  api: {
    title: "Spring Boot",
    name: "API 서버",
    provider: "basic",
    category: "컴퓨팅",
    asset: "spring",
  },
  redis: {
    title: "Redis",
    name: "캐시",
    provider: "basic",
    category: "데이터",
    asset: "redis",
  },
  mysql: {
    title: "MySQL",
    name: "데이터베이스",
    provider: "basic",
    category: "데이터",
    asset: "mysql",
  },
  s3: {
    title: "Amazon S3",
    name: "파일 저장소",
    provider: "basic",
    category: "스토리지",
    asset: "aws-s3",
  },
  kafka: {
    title: "Apache Kafka",
    name: "이벤트 스트림",
    provider: "basic",
    category: "메시징",
    asset: "apachekafka",
  },
  sqs: {
    title: "Amazon SQS",
    name: "작업 큐",
    provider: "basic",
    category: "메시징",
    asset: "aws-sqs",
  },
  custom: {
    title: "Custom",
    name: "사용자 정의",
    provider: "basic",
    category: "기본",
    icon: "component",
  },
};
export const catalog: CatalogItem[] = Object.entries({ ...raw, ...basic }).map(
  ([id, item]) => ({ ...item, id }),
) as CatalogItem[];
export const catalogMap = new Map(catalog.map((c) => [c.id, c]));
export const getItem = (id: string): CatalogItem =>
  catalogMap.get(id) || {
    id,
    title: id,
    name: id,
    provider: "custom",
    category: "사용자 정의",
    icon: "component",
  };
export const iconSource = (id: string) => {
  const item = getItem(id);
  return item.src || (item.asset ? `/icons/${item.asset}.svg` : null);
};
export const categoryName = (s: string) =>
  ({
    Compute: "컴퓨팅",
    Database: "데이터베이스",
    NetworkingContentDelivery: "네트워크·CDN",
    Storage: "스토리지",
    Containers: "컨테이너",
    ApplicationIntegration: "애플리케이션 통합",
  })[s] || s;

export const catalogMappingText = (ids?: string[]) =>
  catalog
    .filter((c) => !ids || ids.includes(c.id))
    .map(
      (c) => `${c.id} = ${c.title}${c.structural ? " (구성 관계 전용)" : ""}`,
    )
    .join("\n");

export const promptCatalogIds = (used: string[] = []) =>
  catalog
    .filter(
      (c) =>
        c.provider !== "aws" ||
        [
          "aws-compute-lambda",
          "aws-compute-ec2",
          "aws-compute-ec2autoscaling",
          "aws-networkingcontentdelivery-cloudfront",
          "aws-networkingcontentdelivery-elasticloadbalancingapplicationloadbalancer",
          "aws-database-rds",
          "aws-database-dynamodb",
          "aws-storage-simplestorageservice",
          "aws-applicationintegration-simplequeueservice",
          "aws-applicationintegration-simplenotificationservice",
          ...used,
        ].includes(c.id),
    )
    .map((c) => c.id);
