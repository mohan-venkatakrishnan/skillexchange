import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand,
  QueryCommand, TransactWriteCommand, BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLE = process.env.TABLE;

export const db = {
  get: (Key) => client.send(new GetCommand({ TableName: TABLE, Key })).then(r => r.Item),
  put: (Item, opts = {}) => client.send(new PutCommand({ TableName: TABLE, Item, ...opts })),
  update: (params) => client.send(new UpdateCommand({ TableName: TABLE, ...params })),
  del: (Key) => client.send(new DeleteCommand({ TableName: TABLE, Key })),
  query: (params) => client.send(new QueryCommand({ TableName: TABLE, ...params })),
  queryAll: async (params) => {
    const items = [];
    let ExclusiveStartKey;
    do {
      const r = await client.send(new QueryCommand({ TableName: TABLE, ...params, ExclusiveStartKey }));
      items.push(...(r.Items || []));
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  },
  transact: (TransactItems) => client.send(new TransactWriteCommand({ TransactItems })),
  batchWrite: async (puts) => {
    for (let i = 0; i < puts.length; i += 25) {
      await client.send(new BatchWriteCommand({
        RequestItems: { [TABLE]: puts.slice(i, i + 25).map(Item => ({ PutRequest: { Item } })) },
      }));
    }
  },
};

// ── Entity helpers ──

export function skillToApi(item, seller) {
  return {
    skillId: item.skillId,
    title: item.title,
    category: item.category,
    description: item.description,
    usageInstructions: item.usageInstructions,
    priceCents: item.priceCents,
    platforms: item.platforms,
    pocUrl: item.pocUrl,
    pocScreenshotUrl: item.pocScreenshotUrl, // presigned, filled by caller when needed
    timeSavedHours: item.timeSavedHours,
    downloadsCount: item.downloadsCount || 0,
    rating: item.rating || 0,
    reviewsCount: item.reviewsCount || 0,
    status: item.status,
    featured: !!item.featured,
    skillBadge: item.skillBadge || null,
    createdAt: item.createdAt,
    sellerId: item.sellerId,
    sellerUsername: item.sellerUsername,
    sellerVerified: seller ? !!seller.isVerified : !!item.sellerVerified,
    sellerBadges: seller ? (seller.badges || []) : (item.sellerBadges || []),
  };
}

export function profileToApi(p, avatarUrl) {
  return {
    userId: p.userId,
    username: p.username,
    name: p.name || p.username,
    bio: p.bio || '',
    location: p.location || '',
    verified: !!p.isVerified,
    badges: p.badges || [],
    salesCount: p.salesCount || 0,
    avatarUrl: avatarUrl || null,
    usernameAutoDerived: !!p.usernameAutoDerived,
    createdAt: p.createdAt,
  };
}

export async function getProfileByUsername(username) {
  const claim = await db.get({ PK: `USERNAME#${username.toLowerCase()}`, SK: 'CLAIM' });
  if (!claim?.userId) return null;
  return db.get({ PK: `USER#${claim.userId}`, SK: 'PROFILE' });
}
