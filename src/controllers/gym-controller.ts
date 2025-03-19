import Gym from "../models/gym-model";
import { Request, Response } from "express";
import { validationResult } from "express-validator";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";

import { getFromCookie } from "./auth-controller";

class GymController {
    // Add a new gym
    static async addGym(req: Request, res: Response): Promise<void> {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ message: "Validation array is not empty", error: errors.array() });
                return;
            }

            const { name, city, description } = req.body;
            const owner = req.query.owner as string;

            if (!req.files || !(req.files as Express.Multer.File[]).length) {
                res.status(400).json({ message: "Please upload at least one picture." });
                return;
            }

            const pictures = (req.files as Express.Multer.File[]).map(
                (file) =>
                    `${req.protocol}://${req.get("host")}/src/uploads/${file.filename}`
            );
            const amountOfReviews = 0;

            const newGym = new Gym({
                name,
                pictures,
                city,
                description,
                amountOfReviews,
                owner: new mongoose.Types.ObjectId(owner),
            });

            await newGym.save();

            res.status(201).json({
                message: "Gym added successfully!",
                gym: newGym
            });
        } catch (err) {
            res.status(500).json({ message: "Internal server error", error: err });
        }
    }

    // Update gym details
    static async updateGymById(req: Request, res: Response): Promise<void> {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ message: "Validation array is not empty", error: errors.array() });
                return;
            }

            const { gymId } = req.params;

            const existingGym = await Gym.findById(gymId);
            if (!existingGym) {
                res.status(404).json({ message: "Gym not found" });
                return;
            }

            const { name, city, description, amountOfReviews } = req.body;

            // Handle image deletion logic
            let updatedPictures = [...existingGym.pictures];
            const pictures = Array.isArray(req.body.pictures) ? req.body.pictures : [];

            const imagesToDelete = existingGym.pictures.filter(
                (image) => !pictures.includes(image)
            );

            // Delete images no longer retained
            imagesToDelete.forEach((image) => {
                const imagePath = path.join(
                    __dirname,
                    "../uploads",
                    path.basename(image)
                );
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            });

            // Handle new image uploads
            const files = req.files as { [fieldname: string]: Express.Multer.File[] };
            if (files && files["pictures[]"]) {
                const newPictures = files["pictures[]"].map(
                    (file) =>
                        `${req.protocol}://${req.get("host")}/src/uploads/${file.filename}`
                );
                updatedPictures = pictures.concat(newPictures);
            } else {
                updatedPictures = pictures;
            }

            // Update gym details
            const updateData: Partial<Record<string, any>> = {
                name,
                city,
                description,
                amountOfReviews,
                pictures: updatedPictures,
            };

            const updatedGym = await Gym.findByIdAndUpdate(gymId, updateData, {
                new: true,
            });

            res.status(200).json({ message: "Gym updated successfully", gym: updatedGym });
        } catch (err) {
            res.status(500).json({ message: "Internal server error", error: err });
        }
    }

    // get all gyms or get gyms by owner
    static async getGyms(req: Request, res: Response): Promise<void> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ message: "Validation array is not empty", error: errors.array() });
            return;
        }

        try {
            let gyms;
            if (req.query.owner) {
                const owner = req.query.owner as string;

                if (!mongoose.Types.ObjectId.isValid(owner)) {
                    res.status(400).json({ error: "Invalid owner ID format" });
                    return;
                }
                gyms = await Gym.find({ owner });
            } else {
                gyms = await Gym.find();
            }
            res.status(200).json({ gyms });
        } catch (err) {
            res.status(500).json({ message: "Internal server error", error: err });
        }
    }

    static async getMyGyms(req: Request, res: Response): Promise<void> {
        try {
            const myUserId = await getFromCookie(req, res, "id");
            let gyms;
            if (!mongoose.Types.ObjectId.isValid(myUserId)) {
                res.status(400).json({ error: "Invalid user ID format" });
                return;
            }
            gyms = await Gym.find({ owner: myUserId });
            res.status(200).json({ gyms });
        } catch (err) {
            res.status(500).json({ message: "Internal server error", error: err });
        }
    }

    // Get gym details by Id
    static async getGymById(req: Request, res: Response): Promise<void> {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ message: "Validation array is not empty", error: errors.array() });
                return;
            }

            const { gymId } = req.params;

            const existingGym = await Gym.findById(gymId);
            if (!existingGym) {
                res.status(404).json({ message: "Gym not found" });
                return;
            }

            res.status(200).json({ message: "Gym extracted successfully", gym: existingGym });
        } catch (err) {
            res.status(500).json({ message: "Internal server error", error: err });
        }
    }

    static async deleteGymById(req: Request, res: Response): Promise<void> {
        try {
            const { gymId } = req.params;
            const gym = await Gym.findById(gymId);
            if (!gym) {
                res.status(404).json({ message: "Gym not found" });
                return;
            }
            if (gym.owner.toString() !== (await getFromCookie(req, res, "id"))) {
                res.status(403).json({ message: "Forbidden. You don't have access to this resource" });
                return;
            }

            if (gym.pictures) {
                await Gym.findByIdAndDelete(gymId);
                gym.pictures.forEach((image) => {
                    const imagePath = path.join(
                        __dirname,
                        "../uploads",
                        path.basename(image)
                    );
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                    }
                });
            }
            res.status(200).json({ message: "Gym deleted successfully" });
        } catch (err) {
            res.status(500).json({ message: "Internal server error", error: err });
        }
    }

    static async filterGyms(req: Request, res: Response): Promise<void> {
        const { search } = req.query;

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ message: "Validation array is not empty", error: errors.array() });
            return;
        }

        if (!search || typeof search !== "string") {
            res.status(400).json({ message: "Search query is required and must be a string" });
            return;
        }

        try {
            const searchRegex = new RegExp(search, "i");

            const gyms = await Gym.find({
                $or: [
                    { name: { $regex: searchRegex } },
                    { city: { $regex: searchRegex } }
                ]
            });

            if (gyms.length === 0) {
                res.status(404).json({ message: "No gyms found matching the search criteria" });
                return;
            }

            res.status(200).json({ gyms });
        } catch (err) {
            res.status(500).json({ message: "Internal server error", error: err });
        }
    }

}

export default GymController;
