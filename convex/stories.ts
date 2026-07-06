import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const stories = await ctx.db.query("stories").order("desc").collect();

    // Resolve storage IDs to public URLs
    return await Promise.all(
      stories.map(async (story) => {
        const coverImageUrl = story.coverImageId
          ? await ctx.storage.getUrl(story.coverImageId)
          : null;
        const narrationAudioUrl = story.narrationAudioId
          ? await ctx.storage.getUrl(story.narrationAudioId)
          : null;
        const videoUrl = story.videoStorageId
          ? await ctx.storage.getUrl(story.videoStorageId)
          : null;
        const storyboard = story.storyboard
          ? await Promise.all(
              story.storyboard.map(async (scene) => ({
                scene_number: scene.scene_number,
                narrative_segment: scene.narrative_segment,
                imageUrl: await ctx.storage.getUrl(scene.imageId) ?? null,
              }))
            )
          : [];
        return {
          ...story,
          coverImageUrl,
          narrationAudioUrl,
          videoUrl,
          storyboard,
        };
      })
    );
  },
});

// Run once on first deploy to populate two sample stories
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("stories").collect();
    if (existing.length > 0) return;

    await ctx.db.insert("stories", {
      title: "Oliver's Forest Discovery",
      genre: "Nature",
      ageGroup: "From 3 to 5",
      storyText: "Once upon a time, in a whispering forest, lived a wise little owl named Oliver. Oliver loved listening to the rustling leaves. One hot summer day, the brook dried up. The animals were thirsty and worried. Oliver flew high and saw a hidden cool spring behind the mossy rocks. He guided all the forest animals to the water, saving the day. Oliver proved that observation and kindness can help solve the biggest problems.",
      moral: "Paying attention to your surroundings can help solve big problems and help your friends.",
      voiceName: "gentle narrator",
      createdAt: Date.now() - 3600000,
    });

    await ctx.db.insert("stories", {
      title: "Leo and the Rusty Gear",
      genre: "Toys",
      ageGroup: "6 to 8",
      storyText: "In a colorful playroom, Leo the toy robot was sad because his wheels wouldn't spin. His friend Barnaby, a wooden train, searched the play box and found a tiny, shiny metal gear. It was rusty, but Barnaby polished it with oil until it shone. They fitted the gear into Leo's motor, and click-clack! Leo could walk again. They realized that working together makes hard tasks easy and fun.",
      moral: "Cooperation and teamwork make any challenge simple and rewarding.",
      voiceName: "excited storyteller",
      createdAt: Date.now(),
    });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const addStory = mutation({
  args: {
    title: v.string(),
    genre: v.string(),
    ageGroup: v.string(),
    storyText: v.string(),
    moral: v.string(),
    coverImageId: v.optional(v.string()),
    narrationAudioId: v.optional(v.string()),
    videoStorageId: v.optional(v.string()),
    voiceName: v.optional(v.string()),
    storyboard: v.optional(v.array(v.object({
      scene_number: v.number(),
      narrative_segment: v.string(),
      imageId: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    const storyId = await ctx.db.insert("stories", {
      ...args,
      createdAt: Date.now(),
    });
    return storyId;
  },
});

export const remove = mutation({
  args: { id: v.id("stories") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
