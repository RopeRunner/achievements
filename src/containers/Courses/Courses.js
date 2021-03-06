import { compose } from "redux";
import { connect } from "react-redux";
import {
  courseHideDialog,
  courseRemoveDialogShow,
  courseRemoveRequest,
  courseShowNewDialog,
  courseSwitchTab
} from "./actions";
import { firebaseConnect } from "react-redux-firebase";
import { sagaInjector } from "../../services/saga";
import AddCourseDialog from "../../components/dialogs/AddCourseDialog";
import Button from "@material-ui/core/Button";
import CoursesTable from "../../components/tables/CoursesTable";
import PropTypes from "prop-types";
import React, { Fragment } from "react";
import RemoveCourseDialog from "../../components/dialogs/RemoveCourseDialog";

import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import Toolbar from "@material-ui/core/Toolbar";

import AddIcon from "@material-ui/icons/Add";

import sagas from "./sagas";
import { APP_SETTING } from "../../achievementsApp/config";

const COURSE_TAB_JOINED = 0;
const COURSE_TAB_OWNED = 1;
const COURSE_TAB_PUBLIC = 2;

class Courses extends React.Component {
  static propTypes = {
    auth: PropTypes.object,
    dispatch: PropTypes.func,
    dialog: PropTypes.any,
    removingCourse: PropTypes.any,
    newCourseValues: PropTypes.object,
    courses: PropTypes.object,
    myCourses: PropTypes.any,
    joinedCourses: PropTypes.any,
    publicCourses: PropTypes.any,
    firebase: PropTypes.object,
    instructorName: PropTypes.string,
    ownerId: PropTypes.string,
    currentTab: PropTypes.number
  };

  onDeleteCourseClick = courseId => {
    const { dispatch, courses } = this.props;
    const course = courses[courseId];

    if (!course) {
      return console.error("Wrong courseId provided");
    }

    dispatch(courseRemoveDialogShow(courseId, course.name));
  };

  switchTab = (event, tabIndex) => {
    this.props.dispatch(courseSwitchTab(tabIndex));
  };

  showNewCourseDialog = () => {
    this.props.dispatch(courseShowNewDialog());
  };
  closeDialog = () => {
    this.props.dispatch(courseHideDialog());
  };
  removeDialogRequest = course => {
    this.props.dispatch(courseRemoveRequest(course.id));
  };
  render() {
    const {
      auth,
      ownerId,
      dispatch,
      newCourseValues,
      removingCourse,
      dialog,
      currentTab,
      publicCourses,
      myCourses,
      joinedCourses
    } = this.props;
    let courses;

    if (auth.isEmpty) {
      return <div>Login required to display this page</div>;
    }

    switch (currentTab) {
      case COURSE_TAB_JOINED:
        courses = joinedCourses;
        break;
      case COURSE_TAB_OWNED:
        courses = myCourses;
        break;
      case COURSE_TAB_PUBLIC:
        courses = publicCourses;
        break;
      default:
        return <div>Something goes wrong</div>;
    }

    return (
      <Fragment>
        {!APP_SETTING.isSuggesting ? (
          <Toolbar>
            <Button
              aria-label="Add"
              color="primary"
              onClick={() => this.showNewCourseDialog()}
              variant="raised"
            >
              Add new course
            </Button>
          </Toolbar>
        ) : (
          <Button
            aria-label="Add"
            color="primary"
            onClick={() => this.showNewCourseDialog()}
            style={{
              position: "fixed",
              bottom: 20,
              right: 20
            }}
            variant="fab"
          >
            <AddIcon />
          </Button>
        )}
        <Tabs
          fullWidth
          indicatorColor="primary"
          onChange={this.switchTab}
          textColor="primary"
          value={currentTab}
        >
          <Tab label="Joined courses" />
          <Tab label="My courses" />
          <Tab label="Public courses" />
        </Tabs>
        <CoursesTable
          courses={courses || {}}
          dispatch={dispatch}
          onDeleteCourseClick={this.onDeleteCourseClick}
          ownerId={ownerId}
        />
        <AddCourseDialog
          course={newCourseValues}
          dispatch={dispatch}
          open={dialog === "NEW_COURSE"}
        />
        <RemoveCourseDialog
          course={removingCourse}
          onClose={this.closeDialog}
          onCommit={this.removeDialogRequest}
          open={dialog === "REMOVE_COURSE"}
        />
      </Fragment>
    );
  }
}

sagaInjector.inject(sagas);

const mapStateToProps = state => ({
  auth: state.firebase.auth,
  courses: Object.assign(
    {},
    state.firebase.data.myCourses,
    state.firebase.data.publicCourses,
    state.courses.joinedCourses
  ),
  myCourses: state.firebase.data.myCourses,
  publicCourses: state.firebase.data.publicCourses,
  joinedCourses: state.courses.joinedCourses,
  instructorName: state.firebase.auth.displayName,
  ownerId: state.firebase.auth.uid,
  dialog: state.courses.dialog,
  removingCourse: state.courses.removingCourse,
  newCourseValues: state.courses.newCourseValues,
  currentTab: state.courses.currentTab
});

export default compose(
  firebaseConnect((ownProps, store) => {
    const firebaseAuth = store.getState().firebase.auth;
    return (
      !firebaseAuth.isEmpty && [
        {
          path: "/courses",
          storeAs: "myCourses",
          queryParams: ["orderByChild=owner", `equalTo=${firebaseAuth.uid}`]
        },
        {
          path: "/courses",
          storeAs: "publicCourses",
          queryParams: ["orderByChild=isPublic", "equalTo=true"]
        }
      ]
    );
  }),
  connect(mapStateToProps)
)(Courses);
