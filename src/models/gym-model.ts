import mongoose, { Schema, Document, Model, Types } from "mongoose";

interface IGym extends Document {
  _id: Types.ObjectId;
  name: string;
  pictures: string[];
  city: string;
  description: string;
  amountOfReviews: number;
  owner: Types.ObjectId;
}

const GymSchema: Schema<IGym> = new mongoose.Schema({
  name: { type: String, required: true },
  pictures: { type: [String], required: true },
  city: { type: String, required: true },
  description: { type: String, required: true },
  amountOfReviews: { type: Number, required: true },
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
});

const Gym: Model<IGym> = mongoose.model<IGym>("Gym", GymSchema);
export default Gym;
