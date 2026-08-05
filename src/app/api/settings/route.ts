import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/connectDB";
import SettingModel from "@/models/Settings.model";
import { getAppUser } from "@/lib/currentUser";

//create and update
export async function POST(request: NextRequest) {
  try {
    const user = await getAppUser();

    if (!user) {
      return NextResponse.json(
        {
          message: "Unauthorized access",
        },
        {
          status: 401,
        }
      );
    }

    const { logo, signature } = await request.json();

    await connectDB();

    const setting = await SettingModel.findOne({ userId: user.id });

    const payload = {
      userId: user.id,
      ...(logo && { invoiceLogo: logo }),
      ...(signature && { signature: signature }),
    };

    //update the document
    if (setting) {
      const updateSetting = await SettingModel.findByIdAndUpdate(
        setting._id,
        payload
      );

      return NextResponse.json({
        message: "Setting updated successfully",
      });
    }

    //create the document
    const createSetting = await SettingModel.create(payload);

    return NextResponse.json({
      message: "Setting updated successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        message: error || error?.message || "Something went wrong",
      },
      {
        status: 500,
      }
    );
  }
}

//get
export async function GET(request: NextRequest) {
  try {
    const user = await getAppUser();

    if (!user) {
      return NextResponse.json(
        {
          message: "Unauthorized access",
        },
        {
          status: 401,
        }
      );
    }

    const getData = await SettingModel.findOne({ userId : user.id })

    return NextResponse.json({
        message : "Success",
        data : getData
    })
  } catch (error : any) {
    return NextResponse.json({
        message : error || error?.message || "Something went wrong"
    })
  }
}
