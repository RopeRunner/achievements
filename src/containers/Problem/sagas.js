/**
 * This module contains sagas for operations on problems.
 * Common workflow of actions:
 * * problemSolutionRefreshRequest
 */

import {
  PROBLEM_CHECK_SOLUTION_REQUEST,
  PROBLEM_INIT_REQUEST,
  PROBLEM_SOLUTION_REFRESH_REQUEST,
  PROBLEM_SOLUTION_SUBMIT_REQUEST,
  PROBLEM_SOLVE_UPDATE,
  problemCheckSolutionFail,
  problemInitFail,
  problemInitSuccess,
  problemSolutionCalculatedWrong,
  problemSolutionProvidedSuccess,
  problemSolutionRefreshFail,
  problemSolutionRefreshRequest,
  problemSolutionRefreshSuccess,
  problemSolutionSubmitFail,
  problemSolutionSubmitSuccess
} from "./actions";
import { delay } from "redux-saga";

import {
  call,
  put,
  race,
  select,
  take,
  takeLatest,
  throttle
} from "redux-saga/effects";
import { pathsService } from "../../services/paths";
import { notificationShow } from "../Root/actions";
import { PATH_GAPI_AUTHORIZED } from "../Paths/actions";
import { APP_SETTING } from "../../achievementsApp/config";

const ONE_MINUTE = 60000;

export function* problemInitRequestHandler(action) {
  try {
    let uid = yield select(state => state.firebase.auth.uid);
    if (!uid) {
      yield take("@@reactReduxFirebase/LOGIN");
      uid = yield select(state => state.firebase.auth.uid);
    }

    yield put(problemInitSuccess(action.pathId, action.problemId, null));

    const gapiAuthrozied = yield select(state => state.paths.gapiAuthorized);

    if (!gapiAuthrozied) {
      yield take(PATH_GAPI_AUTHORIZED);
    }

    const pathProblem = yield call(
      [pathsService, pathsService.fetchPathProblem],
      action.pathId,
      action.problemId
    );

    // if (pathProblem) {
    //   yield put(problemSolutionRefreshSuccess(action.problemId,
    //     pathSolution));
    // }

    if (!pathProblem) {
      throw new Error("Missing path problem");
    }

    yield put(problemInitSuccess(action.pathId, action.problemId, pathProblem));

    const solution = yield call(
      [pathsService, pathsService.fetchSolutionFile],
      action.problemId,
      uid
    );
    if (solution) {
      yield put(problemSolutionRefreshSuccess(action.problemId, solution));
    }
  } catch (err) {
    yield put(problemInitFail(action.pathId, action.problemId, err.message));
    yield put(notificationShow(err.message));
  }
}

export function* problemSolveUpdateHandler(action) {
  const fileId = yield call(pathsService.getFileId, action.fileId);

  yield put(problemSolutionRefreshRequest(action.problemId, fileId));
}

export function* problemSolutionRefreshRequestHandler(action) {
  const data = yield select(state => ({
    uid: state.firebase.auth.uid,
    pathProblem:
      state.problem.pathProblem || state.assignments.dialog.pathProblem
  }));

  if (
    data.pathProblem.type === "jupyterInline" &&
    typeof action.fileId !== "object"
  ) {
    return yield put(
      problemSolutionRefreshSuccess(action.problemId, {
        json: data.pathProblem.solutionJSON
      })
    );
  }

  try {
    yield put(notificationShow("Fetching your solution"));
    let pathSolution;
    if (action.fileId) {
      pathSolution = {
        json:
          typeof action.fileId === "string"
            ? yield call([pathsService, pathsService.fetchFile], action.fileId)
            : action.fileId,
        id: action.fileId
      };
    } else {
      pathSolution = yield call(
        [pathsService, pathsService.fetchSolutionFile],
        action.problemId,
        data.uid
      );
    }

    yield put(
      problemSolutionProvidedSuccess(action.problemId, pathSolution.json)
    );
    yield put(notificationShow("Checking your solution"));

    const { solution, timedOut } = yield race({
      solution: call(
        [pathsService, pathsService.validateSolution],
        data.uid,
        data.pathProblem,
        pathSolution.id,
        pathSolution.json
      ),
      timedOut: delay(ONE_MINUTE)
    });
    if (timedOut) {
      throw new Error("Solution processing timed out");
    }
    if (solution && solution.cells && solution.cells.slice) {
      let solutionFailed = false;

      solution.cells.slice(-data.pathProblem.frozen).forEach(cell => {
        solutionFailed =
          solutionFailed || (!!cell.outputs && cell.outputs.join().trim());
        return true;
      });

      if (solutionFailed) {
        yield put(problemSolutionCalculatedWrong());
        yield put(
          notificationShow(
            "Failing - Your solution did not pass the provided tests."
          )
        );
      } else {
        yield put(notificationShow("Solution is valid"));
      }
    }
    yield put(
      problemSolutionRefreshSuccess(action.problemId, {
        id: pathSolution.id,
        json: solution
      })
    );
  } catch (err) {
    yield put(problemSolutionRefreshFail(action.problemId, err.message));
    yield put(notificationShow(err.message));
  }
}

export function* problemCheckSolutionRequestHandler(action) {
  const data = yield select(state => ({
    uid: state.firebase.auth.uid,
    pathProblem:
      state.problem.pathProblem || state.assignments.dialog.pathProblem
  }));
  try {
    yield put(notificationShow("Checking solution"));
    yield call(
      [pathsService, pathsService.validateSolution],
      data.uid,
      data.pathProblem,
      action.fileId,
      action.solution
    );
    yield put(notificationShow("Solution is valid"));
  } catch (err) {
    yield put(
      problemCheckSolutionFail(
        action.problemId,
        action.fileId,
        action.solution,
        err.message
      )
    );
    yield put(notificationShow(err.message));
  }
}

export function* problemSolutionSubmitRequestHandler(action) {
  try {
    const data = yield select(state => ({
      uid: state.firebase.auth.uid,
      pathProblem:
        state.problem.pathProblem || state.assignments.dialog.pathProblem
    }));
    yield call(
      [pathsService, pathsService.submitSolution],
      data.uid,
      data.pathProblem,
      action.payload
    );
    yield put(
      problemSolutionSubmitSuccess(
        action.pathId,
        action.problemId,
        action.payload
      )
    );
    yield put(notificationShow("Solution is valid!"));
  } catch (err) {
    yield put(
      problemSolutionSubmitFail(
        action.pathId,
        action.problemId,
        action.payload,
        err.message
      )
    );
    yield put(notificationShow(err.message));
  }
}

export default [
  function* watchProblemInitRequest() {
    yield takeLatest(PROBLEM_INIT_REQUEST, problemInitRequestHandler);
  },
  function* watchProblemSolveUpdate() {
    yield throttle(
      APP_SETTING.defaultThrottle,
      PROBLEM_SOLVE_UPDATE,
      problemSolveUpdateHandler
    );
  },
  function* watchProblemSolutionRefreshRequest() {
    yield takeLatest(
      PROBLEM_SOLUTION_REFRESH_REQUEST,
      problemSolutionRefreshRequestHandler
    );
  },
  function* watchProblemCheckSolutionRequest() {
    yield takeLatest(
      PROBLEM_CHECK_SOLUTION_REQUEST,
      problemCheckSolutionRequestHandler
    );
  },
  function* watchProblemSolutionSubmitRequest() {
    yield takeLatest(
      PROBLEM_SOLUTION_SUBMIT_REQUEST,
      problemSolutionSubmitRequestHandler
    );
  }
];
