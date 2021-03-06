import {
  TOGGLE_SELECT_BOOK,
  LOAD_BOOKS,
  LOAD_BOOKS_RESULTS,
  BOOK_READ_CHANGING,
  BOOK_READ_CHANGED,
  TOGGLE_CHECK_ALL,
  SET_PENDING_DELETE_BOOK,
  CANCEL_PENDING_DELETE_BOOK,
  DELETE_BOOK,
  BOOK_DELETING,
  BOOK_DELETED,
  EDITORIAL_REVIEWS_LOADING,
  DETAILS_LOADED,
  EXPAND_BOOK,
  COLLAPSE_BOOK,
  SET_BOOKS_SUBJECTS,
  SET_BOOKS_TAGS,
  EDITING_BOOK_SAVED
} from "./actionNames";

import { BooksModuleType } from "modules/books/reducers/reducer";
import ajaxUtil from "util/ajaxUtil";

import compress from "graphql-query-compress";
import { request, GraphQLClient } from "graphql-request";

export function toggleSelectBook(_id) {
  return { type: TOGGLE_SELECT_BOOK, _id };
}

import { bookSearchType } from "../bookSearch/reducer";

export const setPendingDeleteBook = ({ _id }) => ({ type: SET_PENDING_DELETE_BOOK, _id });
export const cancelPendingDeleteBook = ({ _id }) => ({ type: CANCEL_PENDING_DELETE_BOOK, _id });
export const deleteBook = ({ _id }) => {
  return (dispatch, getState) => {
    dispatch({ type: BOOK_DELETING, _id });

    ajaxUtil.post("/book/deleteBook", { _id }, () => {
      dispatch({ type: BOOK_DELETED, _id });
    });
  };
};

export function loadBooks() {
  return function(dispatch, getState) {
    dispatch({ type: LOAD_BOOKS });

    let state = getState(),
      bookSearch = state.booksModule.bookSearch,
      app = state.app;

    Promise.resolve(booksSearch(bookSearch, app.publicUserId)).then(booksResp => {
      let hasMore = booksResp.results.length > bookSearch.pageSize;
      if (hasMore) {
        booksResp.results = booksResp.results.slice(0, -1);
      }
      window.scrollTo(0, 0);
      dispatch(booksResults(booksResp, hasMore, booksResp.count));
    });
  };
}

const nonEmptyProps = obj =>
  Object.keys(obj).reduce((hash, k) => {
    if ((Array.isArray(obj[k]) && obj[k].length) || (obj[k] !== "" && obj[k] != null)) {
      hash[k] = obj[k];
    }
    return hash;
  }, {});

function booksSearch(bookSearchState: bookSearchType, publicUserId) {
  let version = bookSearchState.searchVersion;
  let bindableSortValue = !bookSearchState.sort ? "_id|desc" : `${bookSearchState.sort}|${bookSearchState.sortDirection == "1" ? "asc" : "desc"}`;
  let [sortField, sortDirection] = bindableSortValue.split("|");
  let sortObject = { [sortField]: sortDirection == "asc" ? 1 : -1 };

  return fetch(
    `/graphql?query=${compress(`
  query ALL_BOOKS_V_${version}(
    $page: Int
    $page_size: Int
    $sort: BookSort
    $title: String
    $isRead: Boolean
    $isRead_ne: Boolean
    $subjects: [String]
    $searchChildSubjects: Boolean
    $tags: [String]
    $author: String
    $publisher: String
    $publicUserId: String
  ){
    allBooks(
      PAGE: $page
      PAGE_SIZE: $page_size
      SORT: $sort
      title_contains: $title
      isRead: $isRead
      isRead_ne: $isRead_ne
      subjects_containsAny: $subjects
      searchChildSubjects: $searchChildSubjects
      tags_containsAny: $tags
      authors_textContains: $author
      publisher_contains: $publisher
      publicUserId: $publicUserId
    ){
      Books{
        _id
        title
        isbn
        ean
        pages
        smallImage
        mediumImage
        publicationDate
        userId
        subjects
        authors
        publisher
        tags
        isRead
        dateAdded
      }, Meta {count}
    }
  }`)}&variables=${JSON.stringify({
      page: bookSearchState.page,
      page_size: bookSearchState.pageSize,
      sort: sortObject,
      title: bookSearchState.search || void 0,
      isRead: bookSearchState.isRead === "1" ? true : void 0,
      isRead_ne: bookSearchState.isRead === "0" ? true : void 0,
      subjects: Object.keys(bookSearchState.subjects).length ? Object.keys(bookSearchState.subjects) : void 0,
      searchChildSubjects: bookSearchState.searchChildSubjects || void 0,
      tags: Object.keys(bookSearchState.tags).length ? Object.keys(bookSearchState.tags) : void 0,
      author: bookSearchState.author || void 0,
      publisher: bookSearchState.publisher || void 0,
      publicUserId: publicUserId || void 0
    })}`,
    { credentials: "include" }
  )
    .then(resp => resp.json())
    .then(resp => {
      if (resp.data && resp.data.allBooks && resp.data.allBooks.Books && resp.data.allBooks.Meta) {
        return { results: resp.data.allBooks.Books, count: resp.data.allBooks.Meta.count };
      }
    });

  return ajaxUtil.get(
    "/book/searchBooks/",
    nonEmptyProps({
      version,
      page: bookSearchState.page,
      pageSize: bookSearchState.pageSize,
      search: bookSearchState.search,
      subjects: Object.keys(bookSearchState.subjects),
      tags: Object.keys(bookSearchState.tags),
      searchChildSubjects: bookSearchState.searchChildSubjects,
      sort: bookSearchState.sort,
      sortDirection: bookSearchState.sortDirection,
      author: bookSearchState.author,
      publisher: bookSearchState.publisher,
      pages: bookSearchState.pages,
      pagesOperator: bookSearchState.pagesOperator,
      userId: publicUserId,
      isRead: bookSearchState.isRead
    })
  );
}

export function expandBook(_id: string) {
  return (dispatch, getState: () => BooksModuleType) => {
    let booksHash = getState().booksModule.books.booksHash;
    let book = booksHash[_id];

    if (!book.detailsLoaded) {
      dispatch({ type: EDITORIAL_REVIEWS_LOADING, _id });
      ajaxUtil.get("/book/loadDetails", { _id }).then(resp => {
        (resp.editorialReviews || []).forEach(ev => {
          if (ev.Source) {
            ev.source = ev.Source;
          }
          if (ev.Content) {
            ev.content = ev.Content;
          }
        });
        dispatch({ type: DETAILS_LOADED, _id, editorialReviews: resp.editorialReviews });
      });
    } else {
      dispatch({ type: EXPAND_BOOK, _id });
    }
  };
}

export function collapseBook(_id: string) {
  return { type: COLLAPSE_BOOK, _id };
}

export function setRead(_id) {
  return function(dispatch, getState) {
    executeSetRead(dispatch, [_id], true);
  };
}

export function setUnRead(_id) {
  return function(dispatch, getState) {
    executeSetRead(dispatch, [_id], false);
  };
}

export function setSelectedRead() {
  return function(dispatch, getState) {
    let selectedBooks = getState().booksModule.books.selectedBooks,
      ids = Object.keys(selectedBooks).filter(_id => selectedBooks[_id]);

    executeSetRead(dispatch, ids, true);
  };
}

export function setSelectedUnRead() {
  return function(dispatch, getState) {
    let selectedBooks = getState().booksModule.books.selectedBooks,
      ids = Object.keys(selectedBooks).filter(_id => selectedBooks[_id]);

    executeSetRead(dispatch, ids, false);
  };
}

function executeSetRead(dispatch, ids, value) {
  dispatch({ type: BOOK_READ_CHANGING, _ids: ids });
  ajaxUtil.post("/book/setRead", { _ids: ids, isRead: value }, () => {
    dispatch({ type: BOOK_READ_CHANGED, _ids: ids, value: value });
  });
}

export const booksResults = (resp, hasMore, count) => ({ type: LOAD_BOOKS_RESULTS, books: resp.results, hasMore, resultsCount: count });

export const toggleCheckAll = () => ({ type: TOGGLE_CHECK_ALL });

export function setBooksSubjects(books, add, remove) {
  return function(dispatch, getState) {
    return ajaxUtil.post("/bookBulk/setSubjects", { books, add, remove }, resp => {
      dispatch({ type: SET_BOOKS_SUBJECTS, books, add, remove });
    });
  };
}

export function setBooksTags(books, add, remove) {
  return function(dispatch, getState) {
    return ajaxUtil.post("/bookBulk/setTags", { books, add, remove }, resp => {
      dispatch({ type: SET_BOOKS_TAGS, books, add, remove });
    });
  };
}

const client = new GraphQLClient("/graphql", { credentials: "include" });

export function saveEditingBook(book) {
  return function(dispatch, getState) {
    console.log(book);

    return client
      .request(
        `
          mutation updateBook(
            $title: String,
            $isbn: String,
            $smallImage: String,
            $pages: String,
            $publisher: String,
            $publicationDate: String,
            $authors: [String]
          ) {
            updateBook(
              _id: "${book._id}",
              Book: {
                title: $title,
                isbn: $isbn,
                smallImage: $smallImage,
                pages: $pages,
                publisher: $publisher,
                publicationDate: $publicationDate,
                authors: $authors
              }
            ) {
              Book {
                _id,
                title,
                isbn,
                smallImage,
                pages,
                publisher,
                publicationDate,
                authors
              }
            }
          }
      `,
        {
          title: book.title,
          isbn: book.isbn,
          smallImage: book.smallImage,
          pages: book.pages,
          publisher: book.publisher,
          publicationDate: book.publicationDate,
          authors: book.authors || []
        }
      )
      .then((resp: any) => {
        if (resp.updateBook && resp.updateBook.Book) {
          dispatch({ type: EDITING_BOOK_SAVED, book: resp.updateBook.Book });
        }
      })
      .catch(error => {
        debugger;
        console.error(error);
      });
  };
}
