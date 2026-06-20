import { db } from "../name";
import createAnswerCollection from "./answer.collection";
import createCommentCollection from "./comment.collection";
import createQuestionCollection from "./question.collection";
import createRateLimitCollection from "./rate-limit.collection";
import createVoteCollection from "./vote.collection";
import createUserSkillScoresCollection from "./user-skill-scores.collection";
import createSkillCalculationEventsCollection from "./skill-calculation-events.collection";
import createTagExpertRegistryCollection from "./tag-expert-registry.collection";
import { databases } from "./config";

export default async function getOrCreateDB(){
  try {
    await databases.get(db)
    console.log("Database connection")
  } catch (error) {
    try {
      await databases.create(db, db)
      console.log("database created")
      //create collections
      await Promise.all([
        createQuestionCollection(),
        createAnswerCollection(),
        createCommentCollection(),
        createVoteCollection(),
        createRateLimitCollection(),
        // Phase 1 — Skill Analytics
        createUserSkillScoresCollection(),
        createSkillCalculationEventsCollection(),
        createTagExpertRegistryCollection(),
      ])
      console.log("Collection created")
      console.log("Database connected")
    } catch (error) {
      console.log("Error creating databases or collection", error)
    }
  }

  return databases
}
