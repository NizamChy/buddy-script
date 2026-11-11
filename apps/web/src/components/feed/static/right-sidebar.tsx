/* Ported from the provided feed.html design; "You Might Like" is live, the rest is decorative. */
import { Suggestions } from "@/components/people";
/* eslint-disable @next/next/no-img-element */
export function RightSidebar() {
  return (
    <>
                  <div className="_layout_right_sidebar_wrap">
                    <div className="_layout_right_sidebar_inner">
                      <Suggestions />
                      
                    </div>
                    <div className="_layout_right_sidebar_inner">
                      <div className="_feed_right_inner_area_card  _padd_t24  _padd_b6 _padd_r24 _padd_l24 _b_radious6 _feed_inner_area">
                        <div className="_feed_top_fixed">
                          <div className="_feed_right_inner_area_card_content _mar_b24">
                            <h4 className="_feed_right_inner_area_card_content_title _title5">Your Friends</h4>
                            <span className="_feed_right_inner_area_card_content_txt">
                              <a className="_feed_right_inner_area_card_content_txt_link" href="#">See All</a>
                            </span>
                          </div>
                          <div className="_feed_right_inner_area_card_form">
                            <svg className="_feed_right_inner_area_card_form_svg" xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 17 17">
                              <circle cx="7" cy="7" r="6" stroke="#666"></circle>
                              <path stroke="#666" strokeLinecap="round" d="M16 16l-3-3"></path>
                            </svg>
                            <input className="form-control me-2 _feed_right_inner_area_card_form_inpt" type="search" placeholder="input search text" aria-label="Search" />
                          </div>
                        </div>
                        <div className="_feed_bottom_fixed">
                          
                        <div className="_feed_right_inner_area_card_ppl _feed_right_inner_area_card_ppl_inactive ">
                          <div className="_feed_right_inner_area_card_ppl_box">
                            <div className="_feed_right_inner_area_card_ppl_image">
                              <a href="#">
                                <img src="/images/people1.png" alt="" className="_box_ppl_img" />
                              </a>
                            </div>
                            <div className="_feed_right_inner_area_card_ppl_txt">
                              <a href="#">
                                <h4 className="_feed_right_inner_area_card_ppl_title">Steve Jobs</h4>
                              </a>
                              <p className="_feed_right_inner_area_card_ppl_para">CEO of Apple</p>
                            </div>
                          </div>
                          <div className="_feed_right_inner_area_card_ppl_side"> <span>5 minute ago</span>
                          </div>
                        </div>
                        <div className="_feed_right_inner_area_card_ppl">
                          <div className="_feed_right_inner_area_card_ppl_box">
                            <div className="_feed_right_inner_area_card_ppl_image">
                              <a href="#">
                                <img src="/images/people2.png" alt="" className="_box_ppl_img" />
                              </a>
                            </div>
                            <div className="_feed_right_inner_area_card_ppl_txt">
                              <a href="#">
                                <h4 className="_feed_right_inner_area_card_ppl_title">Ryan Roslansky</h4>
                              </a>
                              <p className="_feed_right_inner_area_card_ppl_para">CEO of Linkedin</p>
                            </div>
                          </div>
                          <div className="_feed_right_inner_area_card_ppl_side">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 14 14">
                              <rect width="12" height="12" x="1" y="1" fill="#0ACF83" stroke="#fff" strokeWidth="2" rx="6" />
                            </svg>
                          </div>
                        </div>
                        <div className="_feed_right_inner_area_card_ppl">
                          <div className="_feed_right_inner_area_card_ppl_box">
                            <div className="_feed_right_inner_area_card_ppl_image">
                              <a href="#">
                                <img src="/images/people3.png" alt="" className="_box_ppl_img" />
                              </a>
                            </div>
                            <div className="_feed_right_inner_area_card_ppl_txt">
                              <a href="#">
                                <h4 className="_feed_right_inner_area_card_ppl_title">Dylan Field</h4>
                              </a>
                              <p className="_feed_right_inner_area_card_ppl_para">CEO of Figma</p>
                            </div>
                          </div>
                          <div className="_feed_right_inner_area_card_ppl_side">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 14 14">
                              <rect width="12" height="12" x="1" y="1" fill="#0ACF83" stroke="#fff" strokeWidth="2" rx="6" />
                            </svg>
                          </div>
                        </div>
                        <div className="_feed_right_inner_area_card_ppl _feed_right_inner_area_card_ppl_inactive">
                          <div className="_feed_right_inner_area_card_ppl_box">
                            <div className="_feed_right_inner_area_card_ppl_image">
                              <a href="#">
                                <img src="/images/people1.png" alt="" className="_box_ppl_img" />
                              </a>
                            </div>
                            <div className="_feed_right_inner_area_card_ppl_txt">
                              <a href="#">
                                <h4 className="_feed_right_inner_area_card_ppl_title">Steve Jobs</h4>
                              </a>
                              <p className="_feed_right_inner_area_card_ppl_para">CEO of Apple</p>
                            </div>
                          </div>
                          <div className="_feed_right_inner_area_card_ppl_side"> <span>5 minute ago</span>
                          </div>
                        </div>
                        <div className="_feed_right_inner_area_card_ppl">
                          <div className="_feed_right_inner_area_card_ppl_box">
                            <div className="_feed_right_inner_area_card_ppl_image">
                              <a href="#">
                                <img src="/images/people2.png" alt="" className="_box_ppl_img" />
                              </a>
                            </div>
                            <div className="_feed_right_inner_area_card_ppl_txt">
                              <a href="#">
                                <h4 className="_feed_right_inner_area_card_ppl_title">Ryan Roslansky</h4>
                              </a>
                              <p className="_feed_right_inner_area_card_ppl_para">CEO of Linkedin</p>
                            </div>
                          </div>
                          <div className="_feed_right_inner_area_card_ppl_side">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 14 14">
                              <rect width="12" height="12" x="1" y="1" fill="#0ACF83" stroke="#fff" strokeWidth="2" rx="6" />
                            </svg>
                          </div>
                        </div>
                        <div className="_feed_right_inner_area_card_ppl">
                          <div className="_feed_right_inner_area_card_ppl_box">
                            <div className="_feed_right_inner_area_card_ppl_image">
                              <a href="#">
                                <img src="/images/people3.png" alt="" className="_box_ppl_img" />
                              </a>
                            </div>
                            <div className="_feed_right_inner_area_card_ppl_txt">
                              <a href="#">
                                <h4 className="_feed_right_inner_area_card_ppl_title">Dylan Field</h4>
                              </a>
                              <p className="_feed_right_inner_area_card_ppl_para">CEO of Figma</p>
                            </div>
                          </div>
                          <div className="_feed_right_inner_area_card_ppl_side">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 14 14">
                              <rect width="12" height="12" x="1" y="1" fill="#0ACF83" stroke="#fff" strokeWidth="2" rx="6" />
                            </svg>
                          </div>
                        </div>
                        <div className="_feed_right_inner_area_card_ppl">
                          <div className="_feed_right_inner_area_card_ppl_box">
                            <div className="_feed_right_inner_area_card_ppl_image">
                              <a href="#">
                                <img src="/images/people3.png" alt="" className="_box_ppl_img" />
                              </a>
                            </div>
                            <div className="_feed_right_inner_area_card_ppl_txt">
                              <a href="#">
                                <h4 className="_feed_right_inner_area_card_ppl_title">Dylan Field</h4>
                              </a>
                              <p className="_feed_right_inner_area_card_ppl_para">CEO of Figma</p>
                            </div>
                          </div>
                          <div className="_feed_right_inner_area_card_ppl_side">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 14 14">
                              <rect width="12" height="12" x="1" y="1" fill="#0ACF83" stroke="#fff" strokeWidth="2" rx="6" />
                            </svg>
                          </div>
                        </div>
                        <div className="_feed_right_inner_area_card_ppl _feed_right_inner_area_card_ppl_inactive">
                          <div className="_feed_right_inner_area_card_ppl_box">
                            <div className="_feed_right_inner_area_card_ppl_image">
                              <a href="#">
                                <img src="/images/people1.png" alt="" className="_box_ppl_img" />
                              </a>
                            </div>
                            <div className="_feed_right_inner_area_card_ppl_txt">
                              <a href="#">
                                <h4 className="_feed_right_inner_area_card_ppl_title">Steve Jobs</h4>
                              </a>
                              <p className="_feed_right_inner_area_card_ppl_para">CEO of Apple</p>
                            </div>
                          </div>
                          <div className="_feed_right_inner_area_card_ppl_side"> <span>5 minute ago</span>
                          </div>
                        </div>
                        </div>
                        </div>
                      </div>
                    </div>
    </>
  );
}
