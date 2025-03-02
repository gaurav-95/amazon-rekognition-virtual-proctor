const AWS = require("aws-sdk");
const { stringify } = require("uuid");
const uuid = require("uuid").v4;

const {
  COLLECTION_ID,
  FACES_TABLENAME,
  MIN_CONFIDENCE,
  OBJECTS_OF_INTEREST_LABELS,
  REGION,
} = process.env;

const rekognition = new AWS.Rekognition({ region: REGION });
const dynamo = new AWS.DynamoDB({ region: REGION });

const respond = (statusCode, response) => ({
  statusCode,
  body: JSON.stringify(response),
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  },
});

exports.indexHandler = async (event) => {
  const ExternalImageId = uuid();
  const body = JSON.parse(event.body);

  const indexFace = () =>
    rekognition
      .indexFaces({
        CollectionId: COLLECTION_ID,
        ExternalImageId,
        Image: { Bytes: Buffer.from(body.image, "base64") },
      })
      .promise();

  const persistMetadata = () =>
    dynamo
      .putItem({
        Item: {
          CollectionId: { S: COLLECTION_ID },
          ExternalImageId: { S: ExternalImageId },
          FullName: { S: body.fullName },
        },
        TableName: FACES_TABLENAME,
      })
      .promise();

  try {
    await indexFace();
    await persistMetadata();
    return respond(200, { ExternalImageId });
  } catch (e) {
    console.log(e);
    return respond(500, { error: e });
  }
};

const fetchFaces = async (imageBytes) => {
  /*
    Detect Faces
    Uses Rekognition's DetectFaces functionality
  */

  const facesTest = {
    TestName: "Face Detection",
  };

  const eyesTest = {
    TestName: "Eyes Open Detection",
  };

  const mouthTest = {
    TestName: "Mouth Open Detection",
  };

  const pitchTest = {
    TestName: "Pitch Detection",
  };

  const rollTest = {
    TestName: "Roll Detection",
  };

  const yawTest = {
    TestName: "Yaw Detection",
  };

  const emotionTest = {
    TestName: "Emotion Detection",
  };

  const eye1Test = {
    TestName: "Eyes Detection",
  };

  const detectFaces = () =>
    rekognition.detectFaces({ Image: { Bytes: imageBytes },
      Attributes: ['ALL'] }).promise();

  try {
    const faces = await detectFaces();
    const nFaces = faces.FaceDetails.length;
    const eyes = faces.FaceDetails[0].EyesOpen.Value;
    const mouth = faces.FaceDetails[0].MouthOpen.Value;
    const posePitch = faces.FaceDetails[0].Pose.Pitch;
    const poseRoll = faces.FaceDetails[0].Pose.Roll;
    const poseYaw = faces.FaceDetails[0].Pose.Yaw;
    const emotion = faces.FaceDetails[0].Emotions[0].Type;
    const eye1 = faces.FaceDetails[0].Landmarks[0].Y;

    facesTest.Success = nFaces === 1;
    eyesTest.Success = eyes ? true : false;
    mouthTest.Success = mouth ? true : false;
    pitchTest.Success = posePitch ? true : false;
    rollTest.Success = poseRoll ? true : false;
    yawTest.Success = poseYaw ? true : false;
    emotionTest.Success = emotion ? true : false;
    eye1Test.Success = eye1 ? true : false;

    facesTest.Details = nFaces;
    eyesTest.Details = eyes ? "Yes" : "No"
    mouthTest.Details = mouth ? "Yes" : "No"
    pitchTest.Details = posePitch
    rollTest.Details = poseRoll
    yawTest.Details = poseYaw
    emotionTest.Details = emotion
    eye1Test.Details = eye1
    
    console.log("Output object is: " + JSON.stringify([facesTest, eyesTest, mouthTest, pitchTest, rollTest, yawTest, emotionTest, eye1Test]))
    
  } catch (e) {
    console.log(e);
    facesTest.Success = false;
    facesTest.Details = "Server error";
    
    eyesTest.Success = false;
    eyesTest.Details = "Server error";
    
    mouthTest.Success = false;
    mouthTest.Details = "Server error";
    
    pitchTest.Success = false;
    pitchTest.Details = "Server error";

    rollTest.Success = false;
    rollTest.Details = "Server error";
    
    yawTest.Success = false;
    yawTest.Details = "Server error";
    
    emotionTest.Success = false;
    emotionTest.Details = "Server error";

    eye1Test.Success = false;
    eye1Test.Details = "Server error";
  }
  return [facesTest, eyesTest, mouthTest, pitchTest, rollTest, yawTest, emotionTest, eye1Test];
};

const fetchLabels = async (imageBytes) => {
  /*
    Detect Objects Of Interest and number of Persons
    Uses Rekognition's DetectLabels functionality
  */

  const objectsOfInterestLabels = OBJECTS_OF_INTEREST_LABELS.trim().split(",");
  const objectsOfInterestTest = { TestName: "Objects of Interest" };
  const peopleTest = { TestName: "Person Detection" };

  const detectLabels = () =>
    rekognition
      .detectLabels({
        Image: { Bytes: imageBytes },
        MinConfidence: MIN_CONFIDENCE,
      })
      .promise();

  try {
    const labels = await detectLabels();

    const people = labels.Labels.find((x) => x.Name === "Person");
    const nPeople = people ? people.Instances.length : 0;
    peopleTest.Success = nPeople === 1;
    peopleTest.Details = nPeople;

    const objectsOfInterest = labels.Labels.filter((x) =>
      objectsOfInterestLabels.includes(x.Name)
    );
    objectsOfInterestTest.Success = objectsOfInterest.length === 0;
    objectsOfInterestTest.Details = objectsOfInterestTest.Success
      ? "0"
      : objectsOfInterest
          .map((x) => x.Name)
          .sort()
          .join(", ");
  } catch (e) {
    console.log(e);
    objectsOfInterestTest.Success = false;
    objectsOfInterestTest.Details = "Server error";
    peopleTest.Success = false;
    peopleTest.Details = "Server error";
  }
  return [objectsOfInterestTest, peopleTest];
};

const fetchModerationLabels = async (imageBytes) => {
  /*
    Detect Unsafe Content
    Uses Rekognition's DetectModerationLabels functionality
  */
  const moderationLabelsTest = {
    TestName: "Unsafe Content",
  };

  const detectModerationLabels = () =>
    rekognition
      .detectModerationLabels({
        Image: { Bytes: imageBytes },
        MinConfidence: MIN_CONFIDENCE,
      })
      .promise();

  try {
    const labels = await detectModerationLabels();
    const nLabels = labels.ModerationLabels.length;
    moderationLabelsTest.Success = nLabels === 0;
    moderationLabelsTest.Details = moderationLabelsTest.Success
      ? "0"
      : labels.ModerationLabels.map((l) => l.Name)
          .sort()
          .join(", ");
  } catch (e) {
    console.log(e);
    moderationLabelsTest.Success = false;
    moderationLabelsTest.Details = `Server error`;
  }

  return moderationLabelsTest;
};

const searchForIndexedFaces = async (imageBytes) => {
  /*
    Face Matching

    Uses Rekognition's SearchFacesByImage functionality 
    to match face across the database of previously 
    indexed faces
  */

  const faceMatchTest = {
    TestName: "Person Recognition",
    Success: false,
    Details: "0",
  };

  const searchFace = () =>
    rekognition
      .searchFacesByImage({
        CollectionId: COLLECTION_ID,
        FaceMatchThreshold: MIN_CONFIDENCE,
        MaxFaces: 1,
        Image: { Bytes: imageBytes },
      })
      .promise();

  const getFaceByExternalImageId = (id) =>
    dynamo
      .getItem({
        TableName: FACES_TABLENAME,
        Key: { ExternalImageId: { S: id } },
      })
      .promise();

  try {
    const faces = await searchFace();
    const faceDetails = await getFaceByExternalImageId(
      faces.FaceMatches[0].Face.ExternalImageId
    );

    if (faceDetails.Item) {
      faceMatchTest.Success = true;
      faceMatchTest.Details = faceDetails.Item.FullName.S;
    }
  } catch (e) {
    // When 0 faces are recognized, rekognition.searchFacesByImage throws an error
    console.log(e);
  }
  return faceMatchTest;
};

exports.processHandler = async (event) => {
  const body = JSON.parse(event.body);

  console.log("HERE IS THE BODY: " + JSON.stringify(body));

  const imageBytes = Buffer.from(body.image, "base64");

  const result = await Promise.all([
    fetchLabels(imageBytes),
    searchForIndexedFaces(imageBytes),
    fetchFaces(imageBytes),
    fetchModerationLabels(imageBytes),
  ]);

  return respond(200, result.flat());
};
