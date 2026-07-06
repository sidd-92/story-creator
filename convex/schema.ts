import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  stories: defineTable({
    title: v.string(),
    genre: v.string(),
    ageGroup: v.string(),
    storyText: v.string(),
    moral: v.string(),
    narrationAudioId: v.optional(v.string()),
    coverImageId: v.optional(v.string()),
    videoStorageId: v.optional(v.string()),
    voiceName: v.optional(v.string()),
    storyboard: v.optional(v.array(v.object({
      scene_number: v.number(),
      narrative_segment: v.string(),
      imageId: v.string(),
    }))),
    createdAt: v.number(),
  }),
});
